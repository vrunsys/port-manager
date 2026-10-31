import * as assert from 'assert';
import {
	DEFAULT_SETTINGS,
	describeProtection,
	normalizeProcessName,
	normalizeSettings,
	PortSettings,
} from '../../../features/ports/settings/port-settings';
import { PortInfo } from '../../../features/ports/port-types';

const from = (values: Record<string, unknown>) => normalizeSettings(key => values[key]);

function port(overrides: Partial<PortInfo> = {}): PortInfo {
	return { port: 3000, protocol: 'tcp', address: '127.0.0.1', pid: 100, processName: 'node', user: 'varun', ...overrides };
}

const withProtection = (overrides: Partial<PortSettings>): PortSettings => ({ ...DEFAULT_SETTINGS, ...overrides });

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

suite('normalizeProcessName', () => {
	test('ignores case, surrounding spaces and a .exe suffix', () => {
		assert.strictEqual(normalizeProcessName('  Node.EXE '), 'node');
	});
});

suite('describeProtection', () => {
	test('allows everything when nothing is protected', () => {
		assert.strictEqual(describeProtection(port(), DEFAULT_SETTINGS), undefined);
	});

	test('protects a listed port and names the setting', () => {
		const reason = describeProtection(port({ port: 22 }), withProtection({ protectedPorts: [22] }));
		assert.match(reason ?? '', /port 22 is listed in portManager\.protectedPorts/);
	});

	test('does not protect other ports', () => {
		assert.strictEqual(describeProtection(port({ port: 23 }), withProtection({ protectedPorts: [22] })), undefined);
	});

	test('protects a listed process name regardless of case', () => {
		const settings = withProtection({ protectedProcesses: ['postgres'] });
		const reason = describeProtection(port({ processName: 'Postgres' }), settings);
		assert.match(reason ?? '', /"postgres" is listed in portManager\.protectedProcesses/);
	});

	test('matches a Windows name with .exe against a setting without it', () => {
		const settings = withProtection({ protectedProcesses: ['postgres'] });
		assert.ok(describeProtection(port({ processName: 'postgres.exe' }), settings));
	});

	test('matches the executable in the command line when the reported name differs (node is "MainThread")', () => {
		const settings = withProtection({ protectedProcesses: ['node'] });
		const info = port({ processName: 'MainThread', command: '/home/varun/.nvm/versions/node/v24/bin/node server.js' });
		assert.ok(describeProtection(info, settings));
	});

	test('matches a Windows executable path containing spaces', () => {
		const settings = withProtection({ protectedProcesses: ['node'] });
		const info = port({ processName: 'unknown', command: 'C:\\Program Files\\nodejs\\node.exe' });
		assert.ok(describeProtection(info, settings));
	});

	test('matches a daemon whose title was rewritten with a colon', () => {
		const settings = withProtection({ protectedProcesses: ['sshd'] });
		assert.ok(describeProtection(port({ processName: 'unknown', command: 'sshd: /usr/sbin/sshd -D' }), settings));
	});

	test('does not match a process whose name merely contains a protected one', () => {
		const settings = withProtection({ protectedProcesses: ['node'] });
		assert.strictEqual(describeProtection(port({ processName: 'nodemon', command: 'nodemon app.js' }), settings), undefined);
	});

	test('reports the port reason first when both match', () => {
		const settings = withProtection({ protectedPorts: [3000], protectedProcesses: ['node'] });
		assert.match(describeProtection(port(), settings) ?? '', /protectedPorts/);
	});
});
