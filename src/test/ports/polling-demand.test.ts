import * as assert from 'assert';
import { PollingDemand } from '../../features/ports/polling-demand';

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
