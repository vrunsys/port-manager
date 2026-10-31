import * as assert from 'assert';
import { killWindowsProcess } from '../features/ports/kill/windows-kill';
import { CommandError } from '../shared/run-command';

const TEST_PID = 4242;
const TASKLIST_WITH_PROCESS = `"node.exe","${TEST_PID}","Console","1","80,112 K"`;
/** tasklist prints a localized sentence, not CSV, when the filter matches nothing. */
const TASKLIST_WITHOUT_PROCESS = 'INFO: Keine Tasks laufen, die den angegebenen Kriterien entsprechen.';

type Handler = (args: string[]) => string;

function fakeRunner(handlers: { taskkill?: Handler; tasklist?: Handler }) {
	const calls: Array<{ file: string; args: string[] }> = [];
	const run = async (file: string, args: string[]): Promise<string> => {
		calls.push({ file, args });
		const handler = handlers[file as keyof typeof handlers];
		if (!handler) {
			throw new CommandError(`${file} missing`, 'not-found', '', '');
		}
		return handler(args);
	};
	return { run, calls };
}

const taskkillFails = (exitCode: number): Handler => () => {
	throw new CommandError('taskkill failed', 'failed', '', 'localized text', exitCode);
};

suite('killWindowsProcess', () => {
	test('runs taskkill /PID <pid> /T /F and reports killed', async () => {
		const { run, calls } = fakeRunner({ taskkill: () => 'SUCCESS' });
		const result = await killWindowsProcess(TEST_PID, run);
		assert.strictEqual(result.status, 'killed');
		assert.deepStrictEqual(calls, [{ file: 'taskkill', args: ['/PID', String(TEST_PID), '/T', '/F'] }]);
	});

	test('maps exit code 128 to not-found without further checks', async () => {
		const { run, calls } = fakeRunner({ taskkill: taskkillFails(128) });
		assert.strictEqual((await killWindowsProcess(TEST_PID, run)).status, 'not-found');
		assert.strictEqual(calls.length, 1);
	});

	test('maps a refusal for a process that still exists to permission-denied', async () => {
		const { run } = fakeRunner({ taskkill: taskkillFails(1), tasklist: () => TASKLIST_WITH_PROCESS });
		assert.strictEqual((await killWindowsProcess(TEST_PID, run)).status, 'permission-denied');
	});

	test('maps a failure for a process that is already gone to not-found', async () => {
		const { run } = fakeRunner({ taskkill: taskkillFails(1), tasklist: () => TASKLIST_WITHOUT_PROCESS });
		assert.strictEqual((await killWindowsProcess(TEST_PID, run)).status, 'not-found');
	});

	test('maps other exit codes for a living process to failed', async () => {
		const { run } = fakeRunner({ taskkill: taskkillFails(5), tasklist: () => TASKLIST_WITH_PROCESS });
		assert.strictEqual((await killWindowsProcess(TEST_PID, run)).status, 'failed');
	});

	test('reports failed when taskkill cannot be started', async () => {
		const { run } = fakeRunner({});
		const result = await killWindowsProcess(TEST_PID, run);
		assert.strictEqual(result.status, 'failed');
		assert.match(result.message, /taskkill missing/);
	});

	test('never runs taskkill for protected or invalid pids', async () => {
		for (const pid of [0, 1, 4, -1, 2.5, process.pid]) {
			const { run, calls } = fakeRunner({ taskkill: () => 'SUCCESS' });
			assert.strictEqual((await killWindowsProcess(pid, run)).status, 'failed', `pid ${pid}`);
			assert.deepStrictEqual(calls, [], `pid ${pid}`);
		}
	});
});
