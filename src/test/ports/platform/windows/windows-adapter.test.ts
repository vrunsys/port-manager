import * as assert from 'assert';
import { WindowsAdapter } from '../../../../features/ports/platform/windows/windows-adapter';
import { PortListingError } from '../../../../features/ports/port-types';
import { setLogSink } from '../../../../shared/logger';
import { CommandError } from '../../../../shared/run-command';
import { windows } from '../../../fixtures/load-fixtures';
import { fakeWindowsRunner } from '../../../helpers/windows-runner';

const FIVE_MINUTES_MS = 5 * 60 * 1000;
const fallbackResponses = { netstat: windows.netstat.de, tasklist: windows.tasklist };
const failedPowerShell = new CommandError('powershell failed', 'failed', '', 'Access is denied');

/** Collects what is logged while `task` runs. */
async function capturingWarnings<T>(task: () => Promise<T>): Promise<{ result: T; warnings: string[] }> {
	const warnings: string[] = [];
	setLogSink({ info: () => {}, warn: message => void warnings.push(message), error: () => {} });
	try {
		return { result: await task(), warnings };
	} finally {
		setLogSink(undefined);
	}
}

suite('WindowsAdapter.listPorts', () => {
	test('uses PowerShell first and does not touch netstat when it works', async () => {
		const runner = fakeWindowsRunner({ powershell: windows.powershellJson, ...fallbackResponses });
		const ports = await new WindowsAdapter(runner.run).listPorts();
		assert.deepStrictEqual(runner.tools(), ['powershell']);
		assert.strictEqual(ports.length, 5);
	});

	test('calls every tool by its System32 path, with a timeout of its own', async () => {
		const runner = fakeWindowsRunner({ powershell: failedPowerShell, ...fallbackResponses });
		await new WindowsAdapter(runner.run).listPorts();
		for (const call of runner.calls) {
			assert.match(call.file, /System32[\\/]/i, call.tool);
			assert.ok((call.options?.timeoutMs ?? 0) >= 10_000, call.tool);
		}
		assert.strictEqual(runner.calls[0].options?.timeoutMs, 15_000);
	});

	test('sends the PowerShell script as -EncodedCommand', async () => {
		const runner = fakeWindowsRunner({ powershell: '[]' });
		await new WindowsAdapter(runner.run).listPorts();
		assert.deepStrictEqual(runner.calls[0].args.slice(0, 3), ['-NoProfile', '-NonInteractive', '-EncodedCommand']);
		assert.match(Buffer.from(runner.calls[0].args[3], 'base64').toString('utf16le'), /Get-NetTCPConnection/);
	});

	test('falls back to netstat + tasklist when PowerShell is not installed', async () => {
		const runner = fakeWindowsRunner(fallbackResponses);
		const ports = await new WindowsAdapter(runner.run).listPorts();
		assert.deepStrictEqual(runner.tools(), ['powershell', 'netstat', 'tasklist']);
		assert.deepStrictEqual(
			ports.map(p => [p.port, p.pid, p.processName]),
			[[135, 1032, 'svchost.exe'], [3000, 5521, 'node.exe'], [135, 1032, 'svchost.exe']],
		);
	});

	test('falls back when PowerShell fails, times out, or prints something that is not JSON', async () => {
		for (const powershell of [failedPowerShell, new CommandError('slow', 'timeout', '', ''), 'oops, not json']) {
			const runner = fakeWindowsRunner({ powershell, ...fallbackResponses });
			assert.strictEqual((await new WindowsAdapter(runner.run).listPorts()).length, 3);
			assert.deepStrictEqual(runner.tools(), ['powershell', 'netstat', 'tasklist']);
		}
	});

	test('joins non-ASCII process names from tasklist onto Russian netstat output', async () => {
		const runner = fakeWindowsRunner({ netstat: windows.netstat.ru, tasklist: windows.tasklist });
		const ports = await new WindowsAdapter(runner.run).listPorts();
		assert.deepStrictEqual(
			ports.map(p => [p.port, p.processName]),
			[[135, 'svchost.exe'], [3000, 'node.exe'], [8080, 'Яндекс.exe'], [135, 'svchost.exe']],
		);
	});

	test('keeps ports with no name when tasklist does not know the pid', async () => {
		const runner = fakeWindowsRunner({ netstat: windows.netstat.de, tasklist: '"System","4","Services","0","1 K"' });
		const ports = await new WindowsAdapter(runner.run).listPorts();
		assert.strictEqual(ports.length, 3);
		assert.strictEqual(ports[0].processName, undefined);
	});

	test('reports both failures when neither path works, as a typed error', async () => {
		const runner = fakeWindowsRunner({});
		await assert.rejects(new WindowsAdapter(runner.run).listPorts(), (error: unknown) => {
			assert.ok(error instanceof PortListingError);
			assert.match(error.message, /PowerShell: powershell missing; netstat\/tasklist: netstat missing/);
			return true;
		});
	});

	test('classifies a permission failure in the fallback as permission-denied', async () => {
		const runner = fakeWindowsRunner({ netstat: new CommandError('netstat failed', 'failed', '', 'Access is denied.') });
		await assert.rejects(new WindowsAdapter(runner.run).listPorts(), (error: unknown) => {
			assert.ok(error instanceof PortListingError);
			assert.strictEqual(error.kind, 'permission-denied');
			return true;
		});
	});
});

suite('WindowsAdapter remembers a PowerShell failure', () => {
	function adapterWithClock(responses: Parameters<typeof fakeWindowsRunner>[0]) {
		let time = 1_000_000;
		const runner = fakeWindowsRunner(responses);
		return { runner, adapter: new WindowsAdapter(runner.run, () => time), advance: (ms: number) => void (time += ms) };
	}

	test('does not pay for a failing PowerShell on every scan', async () => {
		const { runner, adapter, advance } = adapterWithClock({ powershell: failedPowerShell, ...fallbackResponses });
		await adapter.listPorts();
		advance(2000);
		await adapter.listPorts();
		advance(2000);
		await adapter.listPorts();
		assert.strictEqual(runner.tools().filter(tool => tool === 'powershell').length, 1);
		assert.strictEqual(runner.tools().filter(tool => tool === 'netstat').length, 3);
	});

	test('tries PowerShell again after five minutes', async () => {
		const { runner, adapter, advance } = adapterWithClock({ powershell: failedPowerShell, ...fallbackResponses });
		await adapter.listPorts();
		advance(FIVE_MINUTES_MS - 1);
		await adapter.listPorts();
		assert.strictEqual(runner.tools().filter(tool => tool === 'powershell').length, 1);
		advance(1);
		await adapter.listPorts();
		assert.strictEqual(runner.tools().filter(tool => tool === 'powershell').length, 2);
	});

	test('goes back to PowerShell for good once it works again', async () => {
		let healthy = false;
		const { runner, adapter, advance } = adapterWithClock({
			powershell: () => {
				if (!healthy) {
					throw failedPowerShell;
				}
				return windows.powershellJson;
			},
			...fallbackResponses,
		});
		await adapter.listPorts();
		healthy = true;
		advance(FIVE_MINUTES_MS);
		assert.strictEqual((await adapter.listPorts()).length, 5);
		advance(2000);
		await adapter.listPorts();
		assert.strictEqual(runner.tools().filter(tool => tool === 'netstat').length, 1);
		assert.strictEqual(runner.tools().filter(tool => tool === 'powershell').length, 3);
	});

	test('says so in the log, once, instead of failing silently', async () => {
		const { adapter, advance } = adapterWithClock({ powershell: failedPowerShell, ...fallbackResponses });
		const { warnings } = await capturingWarnings(async () => {
			await adapter.listPorts();
			advance(2000);
			await adapter.listPorts();
		});
		assert.strictEqual(warnings.length, 1);
		assert.match(warnings[0], /PowerShell could not list ports \(powershell failed\)/);
		assert.match(warnings[0], /for the next 5 minutes/);
	});

	test('includes the remembered PowerShell failure when the fallback fails too', async () => {
		const { adapter, advance } = adapterWithClock({ powershell: failedPowerShell });
		await assert.rejects(adapter.listPorts(), /PowerShell: powershell failed; netstat\/tasklist: netstat missing/);
		advance(2000);
		await assert.rejects(adapter.listPorts(), /PowerShell: powershell failed; netstat\/tasklist: netstat missing/);
	});
});
