import * as assert from 'assert';
import { PortsState, PortsService, MIN_INTERVAL_MS, Scheduler } from '../../features/ports/ports-service';
import { KillResult, PlatformAdapter, PortInfo } from '../../features/ports/port-types';
import { CommandError } from '../../shared/run-command';

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

	async killProcess(pid: number): Promise<KillResult> {
		this.killedPids.push(pid);
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

function setup(intervalMs = INTERVAL_MS) {
	const adapter = new FakeAdapter();
	adapter.respondWith([port()]);
	const scheduler = new FakeScheduler();
	const service = new PortsService(adapter, { intervalMs, scheduler });
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
		adapter.respondWith(new CommandError('"ss" is not installed or not on PATH.', 'not-found', '', ''));
		await service.refresh();
		assert.strictEqual(service.state.error?.kind, 'tool-missing');
		assert.strictEqual(service.state.loaded, true);
		assert.strictEqual(events.length, 1);
	});

	test('keeps the last good ports while a scan fails, then recovers', async () => {
		const { adapter, service, events } = setup();
		await service.refresh();
		adapter.respondWith(new CommandError('denied', 'failed', '', 'Permission denied'));
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
		const originalConsoleError = console.error;
		console.error = () => {};
		try {
			service.setPollingEnabled(true);
			await flush();
		} finally {
			console.error = originalConsoleError;
		}
		assert.strictEqual(seen.length, 1);
		assert.strictEqual(scheduler.timers.size, 1);
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

suite('PortsService.killProcess', () => {
	test('kills through the adapter, then rescans so the list is current', async () => {
		const { adapter, service } = setup();
		await service.refresh();
		adapter.respondWith([]);
		const result = await service.killProcess(100);
		assert.deepStrictEqual(adapter.killedPids, [100]);
		assert.strictEqual(result.status, 'killed');
		assert.deepStrictEqual(service.state.ports, []);
	});

	test('rescans even when the kill did not succeed, and returns that result', async () => {
		const { adapter, service } = setup();
		adapter.killResult = { status: 'permission-denied', message: 'no' };
		const result = await service.killProcess(100);
		assert.strictEqual(result.status, 'permission-denied');
		assert.strictEqual(adapter.calls, 1);
	});

	test('rescans and rethrows when the adapter throws', async () => {
		const { adapter, service } = setup();
		adapter.killResult = new Error('adapter bug');
		await assert.rejects(service.killProcess(100), /adapter bug/);
		assert.strictEqual(adapter.calls, 1);
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
