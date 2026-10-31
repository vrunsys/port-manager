import * as assert from 'assert';
import { isOwnedByAnotherUser, whyNotKillable } from '../../../features/ports/kill/kill-policy';
import { LinuxAdapter } from '../../../features/ports/linux/linux-adapter';
import { DEFAULT_SETTINGS, normalizeSettings } from '../../../features/ports/port-settings';
import { PortInfo, UNKNOWN_LABEL } from '../../../features/ports/port-types';
import { linux } from '../../fixtures/load-fixtures';

const OWN = 5000;
const PARENT = 4000;
const environment = { ownPid: OWN, parentPid: PARENT, platform: 'linux' as NodeJS.Platform };

function port(overrides: Partial<PortInfo> = {}): PortInfo {
	return { port: 3000, protocol: 'tcp', address: '127.0.0.1', pid: 100, processName: 'node', user: 'varun', ...overrides };
}

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
		const hidden = port({ pid: undefined, processName: UNKNOWN_LABEL });
		assert.strictEqual(whyNotKillable(hidden, DEFAULT_SETTINGS, environment), undefined);
	});
});

suite('isOwnedByAnotherUser', () => {
	test('is true for a different known user, ignoring case', () => {
		assert.strictEqual(isOwnedByAnotherUser(port({ user: 'root' }), 'varun'), true);
		assert.strictEqual(isOwnedByAnotherUser(port({ user: 'Varun' }), 'varun'), false);
	});

	test('is false for your own processes', () => {
		assert.strictEqual(isOwnedByAnotherUser(port({ user: 'varun' }), 'varun'), false);
	});

	test('is false when either side is unknown, so no warning is invented', () => {
		assert.strictEqual(isOwnedByAnotherUser(port({ user: UNKNOWN_LABEL }), 'varun'), false);
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
