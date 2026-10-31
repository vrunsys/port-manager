import * as assert from 'assert';
import { parseProcStatState, readProcessState } from '../../../../features/ports/platform/unix/process-state';

suite('parseProcStatState', () => {
	test('reads the state letter after the process name', () => {
		assert.strictEqual(parseProcStatState('1234 (node) S 1 1234 1234 0 -1'), 'S');
		assert.strictEqual(parseProcStatState('1234 (node) Z 1 1234 1234 0 -1'), 'Z');
	});

	test('is not fooled by a process name that contains a closing bracket or spaces', () => {
		assert.strictEqual(parseProcStatState('77 (evil) Z 1) S 1 77'), 'S');
		assert.strictEqual(parseProcStatState('77 (my program (v2)) Z 1 77'), 'Z');
	});

	test('returns nothing for text that is not a stat line', () => {
		assert.strictEqual(parseProcStatState(''), undefined);
		assert.strictEqual(parseProcStatState('no brackets here'), undefined);
	});
});

suite('readProcessState', () => {
	test('reads this very process as running on Linux, and as unknown where /proc does not exist', () => {
		const state = readProcessState(process.pid);
		if (process.platform === 'linux') {
			assert.match(state ?? '', /^[RSDT]$/);
		} else {
			assert.ok(state === undefined || /^[A-Za-z]$/.test(state));
		}
	});

	test('returns nothing for a process that does not exist', () => {
		assert.strictEqual(readProcessState(2 ** 22 + 12345), undefined);
	});
});
