import * as assert from 'assert';
import { PortsState, PortsService, PortsServiceOptions, MIN_INTERVAL_MS, Scheduler } from '../../../features/ports/service/ports-service';
import { KillResult, PlatformAdapter, PortInfo, PortListingError } from '../../../features/ports/port-types';
import { setLogSink } from '../../../shared/logger';

const INTERVAL_MS = 1000;

function port(overrides: Partial<PortInfo> = {}): PortInfo {
	return { port: 3000, protocol: 'tcp', address: '127.0.0.1', pid: 100, processName: 'node', user: 'varun', ...overrides };
}

/** Lets promise callbacks (and the service's own `void refresh()`) run. */
const flush = () => new Promise<void>(resolve => setImmediate(resolve));

class FakeScheduler implements Scheduler {
	private nextId = 1;
	readonly timers = new Map<number, { callback: () => void; ms: number }>();

	setTimeout(callback: () => void, ms: number): unknown {
		const id = this.nextId++;
		this.timers.set(id, { callback, ms });
		return id;
	}

	clearTimeout(handle: unknown): void {
		this.timers.delete(handle as number);
	}

	get pendingDelays(): number[] {
		return [...this.timers.values()].map(timer => timer.ms);
	}

	async fireNext(): Promise<void> {
		const [id, timer] = [...this.timers.entries()][0];
		this.timers.delete(id);
		timer.callback();
		await flush();
	}
}

class FakeAdapter implements PlatformAdapter {
	calls = 0;
	listPorts: () => Promise<PortInfo[]> = async () => [];

	killedPids: number[] = [];
	killResult: KillResult | Error = { status: 'killed', message: '' };
	/** Runs when a process is stopped, e.g. to make the next scan stop listing it. */
	afterKill: () => void = () => {};

	async killProcess(pid: number): Promise<KillResult> {
		this.killedPids.push(pid);
		this.afterKill();
		if (this.killResult instanceof Error) {
			throw this.killResult;
		}
		return this.killResult;
	}

	/** Makes the next scans return `result`, which may be an error to throw. */
	respondWith(result: PortInfo[] | Error): void {
		this.listPorts = async () => {
			this.calls++;
			if (result instanceof Error) {
				throw result;
			}
			return result;
		};
	}

	/** Makes scans wait until `release()` is called. */
	holdScans(result: PortInfo[] = []): { release(): void } {
		let release = () => {};
		const gate = new Promise<void>(resolve => (release = resolve));
		this.listPorts = async () => {
			this.calls++;
			await gate;
			return result;
		};
		return { release };
	}
}

function setup(intervalMs = INTERVAL_MS, extra: Partial<PortsServiceOptions> = {}) {
	const adapter = new FakeAdapter();
	adapter.respondWith([port()]);
	const scheduler = new FakeScheduler();
	const service = new PortsService(adapter, { intervalMs, scheduler, ...extra });
	const events: PortsState[] = [];
	service.onDidChange(state => events.push(state));
	return { adapter, scheduler, service, events };
}

suite('PortsService state', () => {
	test('starts empty and not loaded', () => {
		const { service } = setup();
		assert.deepStrictEqual(service.state, { ports: [], loaded: false, error: undefined });
	});

	test('publishes a deduplicated, sorted result after a refresh', async () => {
		const { adapter, service, events } = setup();
		adapter.respondWith([port({ port: 80, address: '::' }), port({ port: 22 }), port({ port: 80, address: '0.0.0.0' })]);
		await service.refresh();
		assert.deepStrictEqual(service.state.ports.map(p => [p.port, p.address]), [[22, '127.0.0.1'], [80, '0.0.0.0, ::']]);
		assert.strictEqual(service.state.loaded, true);
		assert.strictEqual(events.length, 1);
	});

	test('emits nothing when a scan returns the same ports again', async () => {
		const { service, events } = setup();
		await service.refresh();
		await service.refresh();
		await service.refresh();
		assert.strictEqual(events.length, 1);
	});

	test('emits again when the ports change', async () => {
		const { adapter, service, events } = setup();
		await service.refresh();
		adapter.respondWith([port(), port({ port: 4000 })]);
		await service.refresh();
		assert.strictEqual(events.length, 2);
	});

	test('the first empty result still emits because the state is now loaded', async () => {
		const { adapter, service, events } = setup();
		adapter.respondWith([]);
		await service.refresh();
		assert.strictEqual(events.length, 1);
		assert.strictEqual(service.state.loaded, true);
	});

	test('stops notifying a disposed listener', async () => {
		const { service } = setup();
		const seen: PortsState[] = [];
		service.onDidChange(state => seen.push(state)).dispose();
		await service.refresh();
		assert.strictEqual(seen.length, 0);
	});
});

suite('PortsService errors', () => {
	test('exposes an adapter failure as state instead of throwing', async () => {
		const { adapter, service, events } = setup();
		adapter.respondWith(new PortListingError('"ss" is not installed or not on PATH.', 'tool-missing'));
		await service.refresh();
		assert.strictEqual(service.state.error?.kind, 'tool-missing');
		assert.strictEqual(service.state.loaded, true);
		assert.strictEqual(events.length, 1);
	});

	test('keeps the last good ports while a scan fails, then recovers', async () => {
		const { adapter, service, events } = setup();
		await service.refresh();
		adapter.respondWith(new PortListingError('denied', 'permission-denied'));
		await service.refresh();
		assert.strictEqual(service.state.error?.kind, 'permission-denied');
		assert.strictEqual(service.state.ports.length, 1);

		adapter.respondWith([port(), port({ port: 4000 })]);
		await service.refresh();
		assert.strictEqual(service.state.error, undefined);
		assert.strictEqual(service.state.ports.length, 2);
		assert.strictEqual(events.length, 3);
	});

	test('does not repeat the error event while the same error persists', async () => {
		const { adapter, service, events } = setup();
		adapter.respondWith(new Error('boom'));
		await service.refresh();
		await service.refresh();
		assert.strictEqual(events.length, 1);
	});

	test('treats an error that is not a PortListingError as unknown, keeping its message', async () => {
		const { adapter, service } = setup();
		adapter.respondWith(new Error('something odd'));
		await service.refresh();
		assert.deepStrictEqual(service.state.error, { kind: 'unknown', message: 'something odd' });
	});

	test('logs a failed scan so there is a trail beyond the view', async () => {
		const { adapter, service } = setup();
		const logged: string[] = [];
		setLogSink({ info: () => {}, warn: message => void logged.push(message), error: () => {} });
		try {
			adapter.respondWith(new Error('boom'));
			await service.refresh();
		} finally {
			setLogSink(undefined);
		}
		assert.deepStrictEqual(logged, ['Listing ports failed: boom']);
	});

	test('handles an adapter that throws synchronously', async () => {
		const { adapter, service } = setup();
		adapter.listPorts = () => {
			throw new Error('sync boom');
		};
		await service.refresh();
		assert.strictEqual(service.state.error?.message, 'sync boom');
	});

	test('a throwing listener does not stop other listeners or polling', async () => {
		const { scheduler, service } = setup();
		const seen: PortsState[] = [];
		service.onDidChange(() => {
			throw new Error('listener bug');
		});
		service.onDidChange(state => seen.push(state));
		const logged: string[] = [];
		setLogSink({ info: () => {}, warn: () => {}, error: message => void logged.push(message) });
		try {
			service.setPollingEnabled(true);
			await flush();
		} finally {
			setLogSink(undefined);
		}
		assert.strictEqual(seen.length, 1);
		assert.strictEqual(scheduler.timers.size, 1);
		assert.match(logged[0], /change listener threw: listener bug/);
	});
});

suite('PortsService polling', () => {
	test('does not poll until enabled', async () => {
		const { adapter, scheduler } = setup();
		await flush();
		assert.strictEqual(adapter.calls, 0);
		assert.strictEqual(scheduler.timers.size, 0);
	});

	test('scans immediately when enabled, then on every interval', async () => {
		const { adapter, scheduler, service } = setup();
		service.setPollingEnabled(true);
		await flush();
		assert.strictEqual(adapter.calls, 1);
		assert.deepStrictEqual(scheduler.pendingDelays, [INTERVAL_MS]);
		await scheduler.fireNext();
		assert.strictEqual(adapter.calls, 2);
		await scheduler.fireNext();
		assert.strictEqual(adapter.calls, 3);
	});

	test('keeps polling after a failed scan', async () => {
		const { adapter, scheduler, service } = setup();
		adapter.respondWith(new Error('boom'));
		service.setPollingEnabled(true);
		await flush();
		adapter.respondWith([port()]);
		await scheduler.fireNext();
		assert.strictEqual(service.state.error, undefined);
		assert.strictEqual(scheduler.timers.size, 1);
	});

	test('stops scanning when paused and scans again right away when resumed', async () => {
		const { adapter, scheduler, service } = setup();
		service.setPollingEnabled(true);
		await flush();
		service.setPollingEnabled(false);
		assert.strictEqual(scheduler.timers.size, 0);
		assert.strictEqual(adapter.calls, 1);

		service.setPollingEnabled(true);
		await flush();
		assert.strictEqual(adapter.calls, 2);
		assert.strictEqual(scheduler.timers.size, 1);
	});

	test('does not schedule another scan when paused during a running scan', async () => {
		const { adapter, scheduler, service } = setup();
		const gate = adapter.holdScans();
		service.setPollingEnabled(true);
		await flush();
		service.setPollingEnabled(false);
		gate.release();
		await flush();
		assert.strictEqual(scheduler.timers.size, 0);
	});

	test('ignores repeated enable calls', async () => {
		const { adapter, service } = setup();
		service.setPollingEnabled(true);
		service.setPollingEnabled(true);
		await flush();
		assert.strictEqual(adapter.calls, 1);
	});

	test('applies a new interval to the pending timer', async () => {
		const { scheduler, service } = setup();
		service.setPollingEnabled(true);
		await flush();
		service.setIntervalMs(5000);
		assert.deepStrictEqual(scheduler.pendingDelays, [5000]);
	});

	test('never polls faster than the minimum interval', async () => {
		const { scheduler, service } = setup(10);
		service.setPollingEnabled(true);
		await flush();
		assert.deepStrictEqual(scheduler.pendingDelays, [MIN_INTERVAL_MS]);
	});
});

suite('PortsService slow scans', () => {
	/** A clock the adapter advances by the current scan duration on every scan. */
	function withSlowScans(initialScanMs: number) {
		let time = 0;
		let scanMs = initialScanMs;
		const base = setup(INTERVAL_MS, { now: () => time });
		const respond = base.adapter.listPorts;
		base.adapter.listPorts = async () => {
			time += scanMs;
			return respond();
		};
		return { ...base, setScanMs: (ms: number) => void (scanMs = ms) };
	}

	test('waits the normal interval after a quick scan', async () => {
		const { scheduler, service } = withSlowScans(10);
		service.setPollingEnabled(true);
		await flush();
		assert.deepStrictEqual(scheduler.pendingDelays, [INTERVAL_MS]);
	});

	test('waits several times as long as a scan took, so a slow tool is not hammered', async () => {
		const { scheduler, service } = withSlowScans(3000);
		service.setPollingEnabled(true);
		await flush();
		assert.deepStrictEqual(scheduler.pendingDelays, [12000]);
	});

	test('returns to the normal interval once scans are quick again', async () => {
		const { scheduler, service, setScanMs } = withSlowScans(3000);
		service.setPollingEnabled(true);
		await flush();
		assert.deepStrictEqual(scheduler.pendingDelays, [12000]);
		setScanMs(10);
		await scheduler.fireNext();
		assert.deepStrictEqual(scheduler.pendingDelays, [INTERVAL_MS]);
	});

	test('a scan that fails slowly also backs off', async () => {
		const { adapter, scheduler, service } = withSlowScans(2500);
		const respond = adapter.listPorts;
		adapter.listPorts = async () => {
			await respond().catch(() => undefined);
			throw new PortListingError('slow and broken', 'timeout');
		};
		service.setPollingEnabled(true);
		await flush();
		assert.deepStrictEqual(scheduler.pendingDelays, [10000]);
	});
});

suite('PortsService overlapping scans', () => {
	test('joins a refresh made during a running scan instead of starting another', async () => {
		const { adapter, service } = setup();
		const gate = adapter.holdScans([port()]);
		const first = service.refresh();
		const second = service.refresh();
		assert.strictEqual(adapter.calls, 1);
		gate.release();
		await Promise.all([first, second]);
		assert.strictEqual(adapter.calls, 1);
		assert.strictEqual(service.state.ports.length, 1);
	});

	test('arms the next timer only after the running scan ends', async () => {
		const { adapter, scheduler, service } = setup();
		const gate = adapter.holdScans();
		service.setPollingEnabled(true);
		await flush();
		assert.strictEqual(scheduler.timers.size, 0);
		gate.release();
		await flush();
		assert.strictEqual(scheduler.timers.size, 1);
	});

	test('a manual refresh replaces the pending timer instead of adding one', async () => {
		const { scheduler, service } = setup();
		service.setPollingEnabled(true);
		await flush();
		await service.refresh();
		assert.strictEqual(scheduler.timers.size, 1);
	});

	test('can scan again after a scan has finished', async () => {
		const { adapter, service } = setup();
		await service.refresh();
		await service.refresh();
		assert.strictEqual(adapter.calls, 2);
	});
});

suite('PortsService.killPort', () => {
	const target = () => port({ command: 'node server.js' });
	const listingWithCommand = (command: string | undefined) => [port({ command })];

	test('scans first, kills, then rescans so the list is current', async () => {
		const { adapter, service } = setup();
		adapter.respondWith(listingWithCommand('node server.js'));
		adapter.afterKill = () => adapter.respondWith([]);
		const result = await service.killPort(target());
		assert.deepStrictEqual(adapter.killedPids, [100]);
		assert.strictEqual(result.status, 'killed');
		assert.deepStrictEqual(service.state.ports, []);
		assert.strictEqual(adapter.calls, 2);
	});

	test('does not trust a list from before the call: a port that is already gone is not killed', async () => {
		const { adapter, service } = setup();
		await service.refresh();
		adapter.respondWith([]);
		const result = await service.killPort(port());
		assert.strictEqual(result.status, 'not-found');
		assert.deepStrictEqual(adapter.killedPids, []);
	});

	test('does not kill a process that now holds the port under another pid', async () => {
		const { adapter, service } = setup();
		adapter.respondWith([port({ pid: 999 })]);
		assert.strictEqual((await service.killPort(port({ pid: 100 }))).status, 'not-found');
		assert.deepStrictEqual(adapter.killedPids, []);
	});

	test('does not kill when the pid now runs a different command (a recycled pid)', async () => {
		const { adapter, service } = setup();
		adapter.respondWith(listingWithCommand('python other.py'));
		const result = await service.killPort(target());
		assert.strictEqual(result.status, 'failed');
		assert.match(result.message, /different command/);
		assert.deepStrictEqual(adapter.killedPids, []);
	});

	test('still kills when the command is unknown on either side', async () => {
		const { adapter, service } = setup();
		adapter.respondWith(listingWithCommand(undefined));
		assert.strictEqual((await service.killPort(target())).status, 'killed');
		adapter.respondWith(listingWithCommand('node server.js'));
		assert.strictEqual((await service.killPort(port({ command: undefined }))).status, 'killed');
	});

	test('refuses what the kill policy forbids, whoever asks', async () => {
		const { adapter, service } = setup(INTERVAL_MS, { killPolicy: info => (info.port === 3000 ? 'port 3000 is listed in portManager.protectedPorts' : undefined) });
		const result = await service.killPort(port());
		assert.strictEqual(result.status, 'failed');
		assert.match(result.message, /Refusing to stop process 100: port 3000 is listed in portManager\.protectedPorts\./);
		assert.deepStrictEqual(adapter.killedPids, []);
	});

	test('asks the policy about the row it just scanned, not the one the caller holds', async () => {
		const asked: Array<string | undefined> = [];
		const { adapter, service } = setup(INTERVAL_MS, { killPolicy: info => void asked.push(info.command) });
		adapter.respondWith(listingWithCommand('fresh command'));
		await service.killPort(port({ command: undefined }));
		assert.deepStrictEqual(asked, ['fresh command']);
	});

	test('refuses when it cannot re-check the port list, since it cannot confirm anything', async () => {
		const { adapter, service } = setup();
		adapter.respondWith(new PortListingError('ss timed out', 'timeout'));
		const result = await service.killPort(port());
		assert.strictEqual(result.status, 'failed');
		assert.match(result.message, /Could not confirm that process 100 still holds port 3000.*ss timed out/);
		assert.deepStrictEqual(adapter.killedPids, []);
	});

	test('refuses a port whose process is hidden', async () => {
		const { adapter, service } = setup();
		const result = await service.killPort(port({ pid: undefined }));
		assert.strictEqual(result.status, 'failed');
		assert.deepStrictEqual(adapter.killedPids, []);
	});

	test('rescans even when the system refuses, and returns that result', async () => {
		const { adapter, service } = setup();
		adapter.killResult = { status: 'permission-denied', message: 'no' };
		const result = await service.killPort(port());
		assert.strictEqual(result.status, 'permission-denied');
		assert.strictEqual(adapter.calls, 2);
	});

	test('rescans and rethrows when the adapter throws', async () => {
		const { adapter, service } = setup();
		adapter.killResult = new Error('adapter bug');
		await assert.rejects(service.killPort(port()), /adapter bug/);
		assert.strictEqual(adapter.calls, 2);
	});

	test('waits for a scan that is already running and then takes its own, so the check is never older than the call', async () => {
		const { adapter, service } = setup();
		const gate = adapter.holdScans([port()]);
		const running = service.refresh();
		const killing = service.killPort(port());
		gate.release();
		await Promise.all([running, killing]);
		assert.strictEqual(adapter.calls, 3);
		assert.deepStrictEqual(adapter.killedPids, [100]);
	});
});

suite('PortsService dispose', () => {
	test('cancels the timer and ignores later calls', async () => {
		const { adapter, scheduler, service } = setup();
		service.setPollingEnabled(true);
		await flush();
		service.dispose();
		assert.strictEqual(scheduler.timers.size, 0);
		await service.refresh();
		service.setPollingEnabled(true);
		await flush();
		assert.strictEqual(adapter.calls, 1);
	});

	test('drops the result of a scan that finishes after dispose', async () => {
		const { adapter, scheduler, service, events } = setup();
		const gate = adapter.holdScans([port()]);
		service.setPollingEnabled(true);
		await flush();
		service.dispose();
		gate.release();
		await flush();
		assert.strictEqual(events.length, 0);
		assert.strictEqual(scheduler.timers.size, 0);
	});
});
