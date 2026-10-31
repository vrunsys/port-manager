import * as assert from 'assert';
import { checkKillable, describeSystemProcess } from '../features/ports/kill/kill-guards';
import { isOwnedByAnotherUser, whyNotKillable } from '../features/ports/kill/kill-policy';
import { DEFAULT_SETTINGS } from '../features/ports/port-settings';
import { PortInfo, UNKNOWN_LABEL } from '../features/ports/port-types';

const OWN = 5000;
const PARENT = 4000;
const environment = { ownPid: OWN, parentPid: PARENT, platform: 'linux' as NodeJS.Platform };

function port(overrides: Partial<PortInfo> = {}): PortInfo {
	return { port: 3000, protocol: 'tcp', address: '127.0.0.1', pid: 100, processName: 'node', user: 'varun', ...overrides };
}

suite('describeSystemProcess', () => {
	test('allows an ordinary process', () => {
		assert.strictEqual(describeSystemProcess(100, environment), undefined);
	});

	test('refuses PID 0, which is the system or a whole process group', () => {
		assert.match(describeSystemProcess(0, environment) ?? '', /process 0/);
	});

	test('refuses negative, fractional and non-numeric ids', () => {
		for (const pid of [-1, -4242, 1.5, NaN, Infinity]) {
			assert.match(describeSystemProcess(pid, environment) ?? '', /not a valid process id/, String(pid));
		}
	});

	test('refuses PID 1', () => {
		assert.match(describeSystemProcess(1, environment) ?? '', /init process/);
	});

	test('refuses PID 4 on Windows only', () => {
		assert.match(describeSystemProcess(4, { ...environment, platform: 'win32' }) ?? '', /Windows System process/);
		assert.strictEqual(describeSystemProcess(4, { ...environment, platform: 'linux' }), undefined);
		assert.strictEqual(describeSystemProcess(4, { ...environment, platform: 'darwin' }), undefined);
	});

	test('refuses the extension host itself', () => {
		assert.match(describeSystemProcess(OWN, environment) ?? '', /extension host that Port Manager runs in/);
	});

	test('refuses the VS Code process that started the extension host', () => {
		assert.match(describeSystemProcess(PARENT, environment) ?? '', /started the extension host/);
	});
});

suite('checkKillable', () => {
	test('turns a reason into a failed result that names the process', () => {
		const result = checkKillable(1, OWN, 'linux');
		assert.strictEqual(result?.status, 'failed');
		assert.match(result?.message ?? '', /Refusing to stop process 1: process 1 is the system init process\./);
	});

	test('knows about the Windows System process when told the platform', () => {
		assert.strictEqual(checkKillable(4, OWN, 'win32')?.status, 'failed');
		assert.strictEqual(checkKillable(4, OWN, 'linux'), undefined);
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
