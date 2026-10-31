import * as assert from 'assert';
import { checkKillable, describeSystemProcess } from '../../../features/ports/kill/kill-guards';

const OWN = 5000;
const PARENT = 4000;
const environment = { ownPid: OWN, parentPid: PARENT, platform: 'linux' as NodeJS.Platform };

const TEST_PID = 4242;

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

suite('checkKillable with an explicit own pid', () => {
	test('allows an ordinary pid', () => {
		assert.strictEqual(checkKillable(TEST_PID, 1000), undefined);
	});

	test('refuses the given own pid with an explanatory message', () => {
		assert.match(checkKillable(1000, 1000)?.message ?? '', /extension host/);
	});
});
