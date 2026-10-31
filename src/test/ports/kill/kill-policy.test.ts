import * as assert from 'assert';
import { describeProtection, isOwnedByAnotherUser, whyNotKillable } from '../../../features/ports/kill/kill-policy';
import { LinuxAdapter } from '../../../features/ports/platform/linux/linux-adapter';
import { DEFAULT_SETTINGS, normalizeSettings, PortSettings } from '../../../features/ports/settings/port-settings';
import { PortInfo } from '../../../features/ports/port-types';
import { linux } from '../../fixtures/load-fixtures';

const OWN = 5000;
const PARENT = 4000;
const environment = { ownPid: OWN, parentPid: PARENT, platform: 'linux' as NodeJS.Platform };

const withProtection = (overrides: Partial<PortSettings>): PortSettings => ({ ...DEFAULT_SETTINGS, ...overrides });

function port(overrides: Partial<PortInfo> = {}): PortInfo {
	return { port: 3000, protocol: 'tcp', address: '127.0.0.1', pid: 100, processName: 'node', user: 'varun', ...overrides };
}

suite('whyNotKillable (critical processes)', () => {
	const windows = { ...environment, platform: 'win32' as NodeJS.Platform };

	test('blocks an OS-critical process whatever the settings say', () => {
		const lsass = port({ processName: 'lsass', port: 49667, pid: 700 });
		assert.match(whyNotKillable(lsass, DEFAULT_SETTINGS, windows) ?? '', /"lsass" is critical to Windows/);
		assert.match(whyNotKillable(lsass, withProtection({ protectedProcesses: [], protectedPorts: [] }), windows) ?? '', /critical/);
	});

	test('is checked after the settings, so a user protection is reported first', () => {
		const settings = withProtection({ protectedPorts: [49667] });
		assert.match(whyNotKillable(port({ processName: 'lsass', port: 49667, pid: 700 }), settings, windows) ?? '', /protectedPorts/);
	});

	test('does not touch ordinary processes', () => {
		assert.strictEqual(whyNotKillable(port({ processName: 'node' }), DEFAULT_SETTINGS, windows), undefined);
	});

	test('finds a critical process by its executable when the reported name is something else', () => {
		const xorg = port({ processName: 'MainThread', command: '/usr/lib/xorg/Xorg :0 vt2' });
		assert.match(whyNotKillable(xorg, DEFAULT_SETTINGS, environment) ?? '', /"xorg" is critical/);
	});

	test('uses the platform it is told about', () => {
		const lsass = port({ processName: 'lsass' });
		assert.strictEqual(whyNotKillable(lsass, DEFAULT_SETTINGS, { ...environment, platform: 'linux' }), undefined);
	});

	test('blocks none of the real captured Linux listeners', async () => {
		const run = async (file: string) => (file === 'ps' ? linux.ps : linux.ss);
		const ports = await new LinuxAdapter(run).listPorts();
		assert.deepStrictEqual(ports.filter(p => whyNotKillable(p, DEFAULT_SETTINGS, environment)), []);
	});
});

suite('whyNotKillable', () => {
	test('allows an ordinary process with default settings', () => {
		assert.strictEqual(whyNotKillable(port(), DEFAULT_SETTINGS, environment), undefined);
	});

	test('reports a configured protection first', () => {
		const settings = { ...DEFAULT_SETTINGS, protectedPorts: [1] };
		const reason = whyNotKillable(port({ port: 1, pid: 1 }), settings, environment);
		assert.match(reason ?? '', /portManager\.protectedPorts/);
	});

	test('refuses system processes even when no setting protects them', () => {
		assert.match(whyNotKillable(port({ pid: 1 }), DEFAULT_SETTINGS, environment) ?? '', /init process/);
		assert.match(whyNotKillable(port({ pid: OWN }), DEFAULT_SETTINGS, environment) ?? '', /extension host/);
	});

	test('has nothing to say about a hidden process without a configured protection', () => {
		const hidden = port({ pid: undefined, processName: undefined });
		assert.strictEqual(whyNotKillable(hidden, DEFAULT_SETTINGS, environment), undefined);
	});
});

suite('isOwnedByAnotherUser', () => {
	test('treats a user name that BSD ps or lsof cut to 8 characters as the same user', () => {
		assert.strictEqual(isOwnedByAnotherUser(port({ user: 'varunbor' }), 'varunborra'), false);
		assert.strictEqual(isOwnedByAnotherUser(port({ user: 'varunbo+' }), 'varunborra'), false);
		assert.strictEqual(isOwnedByAnotherUser(port({ user: 'varunborra' }), 'varunbor'), false);
	});

	test('still sees another user whose name merely starts the same way', () => {
		assert.strictEqual(isOwnedByAnotherUser(port({ user: 'varunxyz' }), 'varunborra'), true);
		assert.strictEqual(isOwnedByAnotherUser(port({ user: 'varunbo+' }), 'varunxyzabc'), true);
	});

	test('does not mistake a short name for the cut form of a longer one: root is not rootless', () => {
		assert.strictEqual(isOwnedByAnotherUser(port({ user: 'root' }), 'rootless'), true);
		assert.strictEqual(isOwnedByAnotherUser(port({ user: 'rootless' }), 'root'), true);
	});

	test('is true for a different known user, ignoring case', () => {
		assert.strictEqual(isOwnedByAnotherUser(port({ user: 'root' }), 'varun'), true);
		assert.strictEqual(isOwnedByAnotherUser(port({ user: 'Varun' }), 'varun'), false);
	});

	test('is false for your own processes', () => {
		assert.strictEqual(isOwnedByAnotherUser(port({ user: 'varun' }), 'varun'), false);
	});

	test('is false when either side is unknown, so no warning is invented', () => {
		assert.strictEqual(isOwnedByAnotherUser(port({ user: undefined }), 'varun'), false);
		assert.strictEqual(isOwnedByAnotherUser(port({ user: 'root' }), undefined), false);
	});
});

suite('protection guards on real captured ports', () => {
	// ss + ps from the Linux capture: pid 31368 is a node helper holding ports 18101-18106.
	const listPorts = async () => {
		const run = async (file: string) => (file === 'ps' ? linux.ps : linux.ss);
		return new LinuxAdapter(run).listPorts();
	};

	test('a protected port blocks only the rows on that port', async () => {
		const settings = { ...DEFAULT_SETTINGS, protectedPorts: [18101] };
		const blocked = (await listPorts()).filter(p => whyNotKillable(p, settings, environment));
		assert.deepStrictEqual(blocked.map(p => [p.port, p.pid]), [[18101, 31368]]);
	});

	test('a protected process name blocks node even though ss reports it as MainThread', async () => {
		const settings = { ...DEFAULT_SETTINGS, protectedProcesses: ['node'] };
		const blocked = (await listPorts()).filter(p => whyNotKillable(p, settings, environment));
		assert.deepStrictEqual([...new Set(blocked.map(p => p.pid))].sort(), [31368, 31375]);
		assert.ok(blocked.every(p => p.processName === 'MainThread'));
	});

	test('protecting "code" blocks VS Code\'s listeners and nothing else', async () => {
		// Built like production does, so the capitalised name is normalized.
		const settings = normalizeSettings(key => (key === 'protectedProcesses' ? ['Code'] : undefined));
		const blocked = (await listPorts()).filter(p => whyNotKillable(p, settings, environment));
		assert.deepStrictEqual(blocked.map(p => p.port).sort((a, b) => a - b), [20855, 34331, 43623, 45949]);
	});

	test('a row whose process is hidden can still be protected by its port', async () => {
		const settings = { ...DEFAULT_SETTINGS, protectedPorts: [631] };
		const hidden = (await listPorts()).filter(p => p.pid === undefined);
		assert.deepStrictEqual(hidden.filter(p => whyNotKillable(p, settings, environment)).map(p => p.port), [631, 631]);
	});

	test('every real row is allowed with default settings', async () => {
		const blocked = (await listPorts()).filter(p => whyNotKillable(p, DEFAULT_SETTINGS, environment));
		assert.deepStrictEqual(blocked, []);
	});
});

suite('describeProtection (the settings)', () => {
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
