import * as assert from 'assert';
import { killWindowsProcess } from '../../../../features/ports/platform/windows/windows-kill';
import { CommandError } from '../../../../shared/run-command';
import { fakeWindowsRunner } from '../../../helpers/windows-runner';

const TEST_PID = 4242;
const OWN_PID = 9000;
const TASKLIST_WITH_PROCESS = `"node.exe","${TEST_PID}","Console","1","80,112 K"`;
/** tasklist prints a localized sentence, not CSV, when the filter matches nothing. */
const TASKLIST_WITHOUT_PROCESS = 'INFO: Keine Tasks laufen, die den angegebenen Kriterien entsprechen.';
/** The JSON list of the extension host's parent, grandparent and so on. */
const ANCESTORS = '[8800,500,4]';

const taskkillFails = (exitCode: number) => new CommandError('taskkill failed', 'failed', '', 'localized text', exitCode);
const kill = (run: Parameters<typeof killWindowsProcess>[1], pid = TEST_PID) => killWindowsProcess(pid, run, OWN_PID);

suite('killWindowsProcess', () => {
	test('stops the whole tree with taskkill /PID <pid> /T /F once the ancestry is known and clear', async () => {
		const runner = fakeWindowsRunner({ powershell: ANCESTORS, taskkill: 'SUCCESS' });
		const result = await kill(runner.run);
		assert.strictEqual(result.status, 'killed');
		assert.deepStrictEqual(runner.tools(), ['powershell', 'taskkill']);
		assert.deepStrictEqual(runner.calls[1].args, ['/PID', String(TEST_PID), '/T', '/F']);
	});

	test('calls taskkill by its System32 path, with room for a big tree', async () => {
		const runner = fakeWindowsRunner({ powershell: ANCESTORS, taskkill: 'SUCCESS' });
		await kill(runner.run);
		assert.match(runner.calls[1].file, /System32[\\/]taskkill\.exe$/i);
		assert.strictEqual(runner.calls[1].options?.timeoutMs, 15_000);
	});

	test('reads the parent chain of the extension host, not of the target', async () => {
		const runner = fakeWindowsRunner({ powershell: ANCESTORS, taskkill: 'SUCCESS' });
		await kill(runner.run);
		const script = Buffer.from(runner.calls[0].args[3], 'base64').toString('utf16le');
		assert.match(script, new RegExp(`\\$current = ${OWN_PID}\\b`));
	});

	test('refuses an ancestor of the extension host, because /T would close VS Code', async () => {
		const runner = fakeWindowsRunner({ powershell: ANCESTORS, taskkill: 'SUCCESS' });
		const result = await kill(runner.run, 500);
		assert.strictEqual(result.status, 'failed');
		assert.match(result.message, /Refusing to stop process 500: it started the VS Code extension host/);
		assert.deepStrictEqual(runner.tools(), ['powershell']);
	});

	test('stops only the process itself, without /T, when the ancestry cannot be read', async () => {
		const runner = fakeWindowsRunner({ powershell: new CommandError('blocked', 'failed', '', 'Access is denied'), taskkill: 'SUCCESS' });
		const result = await kill(runner.run);
		assert.strictEqual(result.status, 'killed');
		assert.deepStrictEqual(runner.calls[1].args, ['/PID', String(TEST_PID), '/F']);
	});

	test('does the same when PowerShell is missing or prints something unreadable', async () => {
		for (const powershell of [undefined, 'not json at all']) {
			const runner = fakeWindowsRunner({ ...(powershell ? { powershell } : {}), taskkill: 'SUCCESS' });
			await kill(runner.run);
			assert.deepStrictEqual(runner.calls.at(-1)?.args, ['/PID', String(TEST_PID), '/F'], String(powershell));
		}
	});

	test('maps exit code 128 to not-found without further checks', async () => {
		const runner = fakeWindowsRunner({ powershell: ANCESTORS, taskkill: taskkillFails(128) });
		assert.strictEqual((await kill(runner.run)).status, 'not-found');
		assert.deepStrictEqual(runner.tools(), ['powershell', 'taskkill']);
	});

	test('maps a refusal for a process that still exists to permission-denied', async () => {
		const runner = fakeWindowsRunner({ powershell: ANCESTORS, taskkill: taskkillFails(1), tasklist: TASKLIST_WITH_PROCESS });
		assert.strictEqual((await kill(runner.run)).status, 'permission-denied');
	});

	test('maps a failure for a process that is already gone to not-found', async () => {
		const runner = fakeWindowsRunner({ powershell: ANCESTORS, taskkill: taskkillFails(1), tasklist: TASKLIST_WITHOUT_PROCESS });
		assert.strictEqual((await kill(runner.run)).status, 'not-found');
	});

	test('maps other exit codes for a living process to failed', async () => {
		const runner = fakeWindowsRunner({ powershell: ANCESTORS, taskkill: taskkillFails(5), tasklist: TASKLIST_WITH_PROCESS });
		assert.strictEqual((await kill(runner.run)).status, 'failed');
	});

	test('reports failed when taskkill cannot be started', async () => {
		const runner = fakeWindowsRunner({ powershell: ANCESTORS });
		const result = await kill(runner.run);
		assert.strictEqual(result.status, 'failed');
		assert.match(result.message, /taskkill missing/);
	});

	test('never runs anything for protected or invalid pids', async () => {
		for (const pid of [0, 1, 4, -1, 2.5, OWN_PID]) {
			const runner = fakeWindowsRunner({ powershell: ANCESTORS, taskkill: 'SUCCESS' });
			assert.strictEqual((await kill(runner.run, pid)).status, 'failed', `pid ${pid}`);
			assert.deepStrictEqual(runner.calls, [], `pid ${pid}`);
		}
	});
});
