import * as assert from 'assert';
import { PollingDemand } from '../../../features/ports/service/polling-demand';
import { PortsService, Scheduler } from '../../../features/ports/service/ports-service';
import { PlatformAdapter, PortInfo } from '../../../features/ports/port-types';

function setup() {
	const calls: boolean[] = [];
	const demand = new PollingDemand({ setPollingEnabled: enabled => void calls.push(enabled) });
	return { demand, calls };
}

suite('PollingDemand', () => {
	test('turns polling on when something asks for it', () => {
		const { demand, calls } = setup();
		demand.set('view', true);
		assert.deepStrictEqual(calls, [true]);
	});

	test('keeps polling while the status bar needs it after the view is hidden', () => {
		const { demand, calls } = setup();
		demand.set('view', true);
		demand.set('status-bar', true);
		demand.set('view', false);
		assert.strictEqual(calls[calls.length - 1], true);
	});

	test('keeps polling while the view needs it after the status bar is hidden', () => {
		const { demand, calls } = setup();
		demand.set('view', true);
		demand.set('status-bar', true);
		demand.set('status-bar', false);
		assert.strictEqual(calls[calls.length - 1], true);
	});

	test('turns polling off only when nothing needs it any more', () => {
		const { demand, calls } = setup();
		demand.set('view', true);
		demand.set('status-bar', true);
		demand.set('view', false);
		demand.set('status-bar', false);
		assert.strictEqual(calls[calls.length - 1], false);
	});

	test('treats repeated requests from the same source as one', () => {
		const { demand, calls } = setup();
		demand.set('view', true);
		demand.set('view', true);
		demand.set('view', false);
		assert.strictEqual(calls[calls.length - 1], false);
	});

	test('stays off when asked to stop something that never started', () => {
		const { demand, calls } = setup();
		demand.set('status-bar', false);
		assert.deepStrictEqual(calls, [false]);
	});
});

suite('PollingDemand: window focus', () => {
	test('a window is focused by default, so asking for polling starts it', () => {
		const { demand, calls } = setup();
		demand.set('view', true);
		assert.deepStrictEqual(calls, [true]);
	});

	test('losing focus stops polling even though the view is still visible', () => {
		const { demand, calls } = setup();
		demand.set('view', true);
		demand.setWindowFocused(false);
		assert.strictEqual(calls.at(-1), false);
	});

	test('gaining focus again restarts polling', () => {
		const { demand, calls } = setup();
		demand.set('view', true);
		demand.setWindowFocused(false);
		demand.setWindowFocused(true);
		assert.deepStrictEqual(calls, [true, false, true]);
	});

	test('asking for polling while unfocused waits for the focus', () => {
		const { demand, calls } = setup();
		demand.setWindowFocused(false);
		demand.set('view', true);
		demand.set('status-bar', true);
		assert.ok(calls.every(enabled => enabled === false));
		demand.setWindowFocused(true);
		assert.strictEqual(calls.at(-1), true);
	});

	test('regaining focus does not start polling when nothing is on screen', () => {
		const { demand, calls } = setup();
		demand.setWindowFocused(false);
		demand.setWindowFocused(true);
		assert.ok(calls.every(enabled => enabled === false));
	});

	test('focus and visibility both have to hold: hiding the last thing while unfocused keeps polling off after refocus', () => {
		const { demand, calls } = setup();
		demand.set('view', true);
		demand.setWindowFocused(false);
		demand.set('view', false);
		demand.setWindowFocused(true);
		assert.strictEqual(calls.at(-1), false);
	});
});

suite('PollingDemand with a real PortsService', () => {
	function serviceWithDemand() {
		let scans = 0;
		const adapter: PlatformAdapter = {
			listPorts: async (): Promise<PortInfo[]> => {
				scans++;
				return [];
			},
			killProcess: async () => ({ status: 'killed', message: '' }),
		};
		const timers = new Set<number>();
		let nextTimer = 1;
		const scheduler: Scheduler = {
			setTimeout: () => {
				const id = nextTimer++;
				timers.add(id);
				return id;
			},
			clearTimeout: handle => void timers.delete(handle as number),
		};
		const service = new PortsService(adapter, { scheduler });
		return { demand: new PollingDemand(service), scans: () => scans, timers, service };
	}
	const flush = () => new Promise<void>(resolve => setImmediate(resolve));

	test('an unfocused window does not scan, however much is on screen', async () => {
		const { demand, scans, timers } = serviceWithDemand();
		demand.setWindowFocused(false);
		demand.set('view', true);
		demand.set('status-bar', true);
		await flush();
		assert.strictEqual(scans(), 0);
		assert.strictEqual(timers.size, 0);
	});

	test('focusing the window scans at once and schedules the next scan', async () => {
		const { demand, scans, timers } = serviceWithDemand();
		demand.setWindowFocused(false);
		demand.set('view', true);
		demand.setWindowFocused(true);
		await flush();
		assert.strictEqual(scans(), 1);
		assert.strictEqual(timers.size, 1);
	});

	test('losing focus cancels the scan that was scheduled', async () => {
		const { demand, timers } = serviceWithDemand();
		demand.set('view', true);
		await flush();
		assert.strictEqual(timers.size, 1);
		demand.setWindowFocused(false);
		assert.strictEqual(timers.size, 0);
	});
});
