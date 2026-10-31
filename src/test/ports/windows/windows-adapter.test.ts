import * as assert from 'assert';
import { CommandError, RunCommandOptions } from '../../../shared/run-command';
import { LIST_PORTS_SCRIPT } from '../../../features/ports/windows/powershell-script';
import { WindowsAdapter } from '../../../features/ports/windows/windows-adapter';
import { windows } from '../../fixtures/load-fixtures';

type Response = string | CommandError;

const missing = (file: string) => new CommandError(`${file} missing`, 'not-found', '', '');

function fakeRunner(responses: Record<string, Response>) {
	const calls: Array<{ file: string; args: string[]; options?: RunCommandOptions }> = [];
	const run = async (file: string, args: string[], options?: RunCommandOptions): Promise<string> => {
		calls.push({ file, args, options });
		const response = responses[file] ?? missing(file);
		if (response instanceof CommandError) {
			throw response;
		}
		return response;
	};
	return { run, calls, files: () => calls.map(call => call.file) };
}

const fallbackResponses = { netstat: windows.netstat.de, tasklist: windows.tasklist };

suite('WindowsAdapter.listPorts', () => {
	test('uses PowerShell first and does not touch netstat when it works', async () => {
		const runner = fakeRunner({ 'powershell.exe': windows.powershellJson, ...fallbackResponses });
		const ports = await new WindowsAdapter(runner.run).listPorts();
		assert.deepStrictEqual(runner.files(), ['powershell.exe']);
		assert.strictEqual(ports.length, 5);
	});

	test('sends the script as -EncodedCommand with a generous timeout', async () => {
		const runner = fakeRunner({ 'powershell.exe': '[]' });
		await new WindowsAdapter(runner.run).listPorts();
		const { args, options } = runner.calls[0];
		assert.deepStrictEqual(args.slice(0, 3), ['-NoProfile', '-NonInteractive', '-EncodedCommand']);
		assert.strictEqual(Buffer.from(args[3], 'base64').toString('utf16le'), LIST_PORTS_SCRIPT);
		assert.ok((options?.timeoutMs ?? 0) > 5000);
	});

	test('falls back to netstat + tasklist when PowerShell is not installed', async () => {
		const runner = fakeRunner(fallbackResponses);
		const ports = await new WindowsAdapter(runner.run).listPorts();
		assert.deepStrictEqual(runner.files(), ['powershell.exe', 'netstat', 'tasklist']);
		assert.deepStrictEqual(
			ports.map(p => [p.port, p.pid, p.processName]),
			[[135, 1032, 'svchost.exe'], [3000, 5521, 'node.exe'], [135, 1032, 'svchost.exe']],
		);
	});

	test('falls back when PowerShell fails', async () => {
		const failed = new CommandError('powershell failed', 'failed', '', 'Access is denied');
		const runner = fakeRunner({ 'powershell.exe': failed, ...fallbackResponses });
		assert.strictEqual((await new WindowsAdapter(runner.run).listPorts()).length, 3);
		assert.deepStrictEqual(runner.files(), ['powershell.exe', 'netstat', 'tasklist']);
	});

	test('falls back when PowerShell times out', async () => {
		const timedOut = new CommandError('powershell timed out', 'timeout', '', '');
		const runner = fakeRunner({ 'powershell.exe': timedOut, ...fallbackResponses });
		await new WindowsAdapter(runner.run).listPorts();
		assert.deepStrictEqual(runner.files(), ['powershell.exe', 'netstat', 'tasklist']);
	});

	test('falls back when PowerShell prints something that is not JSON', async () => {
		const runner = fakeRunner({ 'powershell.exe': 'oops, not json', ...fallbackResponses });
		await new WindowsAdapter(runner.run).listPorts();
		assert.deepStrictEqual(runner.files(), ['powershell.exe', 'netstat', 'tasklist']);
	});

	test('joins non-ASCII process names from tasklist onto Russian netstat output', async () => {
		const runner = fakeRunner({ netstat: windows.netstat.ru, tasklist: windows.tasklist });
		const ports = await new WindowsAdapter(runner.run).listPorts();
		assert.deepStrictEqual(
			ports.map(p => [p.port, p.processName]),
			[[135, 'svchost.exe'], [3000, 'node.exe'], [8080, 'Яндекс.exe'], [135, 'svchost.exe']],
		);
	});

	test('keeps ports with an unknown name when tasklist does not know the pid', async () => {
		const runner = fakeRunner({ netstat: windows.netstat.de, tasklist: '"System","4","Services","0","1 K"' });
		const ports = await new WindowsAdapter(runner.run).listPorts();
		assert.strictEqual(ports.length, 3);
		assert.strictEqual(ports[0].processName, 'unknown');
	});

	test('reports both failures when neither path works', async () => {
		const runner = fakeRunner({});
		await assert.rejects(
			new WindowsAdapter(runner.run).listPorts(),
			/PowerShell: powershell\.exe missing; netstat\/tasklist: netstat missing/,
		);
	});
});
