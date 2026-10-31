import * as assert from 'assert';
import { DEFAULT_SETTINGS, normalizeSettings } from '../../../features/ports/settings/port-settings';

const from = (values: Record<string, unknown>) => normalizeSettings(key => values[key]);



suite('normalizeSettings', () => {
	test('uses the documented defaults when nothing is configured', () => {
		assert.deepStrictEqual(from({}), DEFAULT_SETTINGS);
		assert.strictEqual(DEFAULT_SETTINGS.refreshIntervalMs, 2000);
		assert.strictEqual(DEFAULT_SETTINGS.confirmBeforeKill, true);
		assert.strictEqual(DEFAULT_SETTINGS.showStatusBar, true);
	});

	test('converts the refresh interval from seconds to milliseconds', () => {
		assert.strictEqual(from({ refreshInterval: 5 }).refreshIntervalMs, 5000);
		assert.strictEqual(from({ refreshInterval: 1.5 }).refreshIntervalMs, 1500);
	});

	test('raises an interval below the minimum and caps a huge one', () => {
		assert.strictEqual(from({ refreshInterval: 0.1 }).refreshIntervalMs, 1000);
		assert.strictEqual(from({ refreshInterval: -3 }).refreshIntervalMs, 1000);
		assert.strictEqual(from({ refreshInterval: 99999 }).refreshIntervalMs, 600_000);
	});

	test('falls back to the default for an interval that is not a number', () => {
		for (const bad of ['fast', null, NaN, Infinity, {}]) {
			assert.strictEqual(from({ refreshInterval: bad }).refreshIntervalMs, 2000, String(bad));
		}
	});

	test('reads the booleans and ignores values of the wrong type', () => {
		assert.strictEqual(from({ confirmBeforeKill: false }).confirmBeforeKill, false);
		assert.strictEqual(from({ showStatusBar: false }).showStatusBar, false);
		assert.strictEqual(from({ confirmBeforeKill: 'no' }).confirmBeforeKill, true);
		assert.strictEqual(from({ showStatusBar: 0 }).showStatusBar, true);
	});

	test('keeps valid protected ports and drops invalid and duplicate entries', () => {
		const settings = from({ protectedPorts: [22, 5432, 22, 0, 70000, 1.5, '80', null] });
		assert.deepStrictEqual(settings.protectedPorts, [22, 5432]);
	});

	test('normalizes protected process names and drops invalid and duplicate entries', () => {
		const settings = from({ protectedProcesses: ['SSHD', ' postgres.exe ', 'sshd', '', '  ', 42] });
		assert.deepStrictEqual(settings.protectedProcesses, ['sshd', 'postgres']);
	});

	test('treats a protected list that is not an array as empty', () => {
		const settings = from({ protectedPorts: 22, protectedProcesses: 'sshd' });
		assert.deepStrictEqual([settings.protectedPorts, settings.protectedProcesses], [[], []]);
	});
});
