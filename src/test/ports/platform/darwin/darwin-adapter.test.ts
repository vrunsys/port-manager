import * as assert from 'assert';
import { DarwinAdapter } from '../../../../features/ports/platform/darwin/darwin-adapter';
import { PortListingError } from '../../../../features/ports/port-types';
import { setLogSink } from '../../../../shared/logger';
import { CommandError, RunCommandOptions } from '../../../../shared/run-command';
import { macos } from '../../../fixtures/load-fixtures';

function fakeRunner(responses: Record<string, string | CommandError>) {
	const calls: Array<[string, string[]]> = [];
	const timeouts: Array<number | undefined> = [];
	const run = async (file: string, args: string[], options?: RunCommandOptions): Promise<string> => {
		calls.push([file, args]);
		timeouts.push(options?.timeoutMs);
		const response = responses[file];
		if (response instanceof CommandError) {
			throw response;
		}
		return response ?? '';
	};
	return { run, calls, timeouts };
}

suite('DarwinAdapter.listPorts', () => {
	test('runs lsof with the listening-TCP arguments, then ps for command lines', async () => {
		const { run, calls } = fakeRunner({ lsof: macos.lsofTable, ps: macos.ps });
		const ports = await new DarwinAdapter(run).listPorts();
		assert.deepStrictEqual(calls[0], ['lsof', ['-iTCP', '-sTCP:LISTEN', '-nP', '+c', '0']]);
		assert.strictEqual(calls[1][0], 'ps');
		assert.strictEqual(ports.length, 11);
		assert.strictEqual(ports.find(p => p.port === 3000)?.command, 'node server.js --port 3000');
	});

	test('returns no ports when lsof exits 1 with nothing to report', async () => {
		const noMatch = new CommandError('exit 1', 'failed', '', '');
		const { run } = fakeRunner({ lsof: noMatch });
		assert.deepStrictEqual(await new DarwinAdapter(run).listPorts(), []);
	});

	test('reports a missing lsof', async () => {
		const notFound = new CommandError('"lsof" is not installed or not on PATH.', 'not-found', '', '');
		const { run } = fakeRunner({ lsof: notFound });
		await assert.rejects(new DarwinAdapter(run).listPorts(), /lsof/);
	});

	test('asks lsof for full command names, and gives it time on a busy machine', async () => {
		const { run, calls, timeouts } = fakeRunner({ lsof: macos.lsofTable, ps: macos.ps });
		await new DarwinAdapter(run).listPorts();
		assert.ok(calls[0][1].join(' ').includes('+c 0'));
		assert.strictEqual(timeouts[0], 15_000);
	});

	test('still lists the ports, without users and commands, when ps fails', async () => {
		const warnings: string[] = [];
		setLogSink({ info: () => {}, warn: message => void warnings.push(message), error: () => {} });
		try {
			const { run } = fakeRunner({ lsof: macos.lsofTable, ps: new CommandError('ps failed', 'failed', '', 'usage: ps ...') });
			const ports = await new DarwinAdapter(run).listPorts();
			assert.strictEqual(ports.length, 11);
			assert.strictEqual(ports.find(p => p.port === 3000)?.command, undefined);
			assert.strictEqual(ports.find(p => p.port === 3000)?.user, 'varun');
			assert.match(warnings[0], /ps failed, so users and command lines are not shown/);
		} finally {
			setLogSink(undefined);
		}
	});

	test('reports a typed error with the right kind when lsof is missing, slow or refused', async () => {
		const cases: Array<[CommandError, string]> = [
			[new CommandError('"lsof" is not installed or not on PATH.', 'not-found', '', ''), 'tool-missing'],
			[new CommandError('"lsof" did not finish', 'timeout', '', ''), 'timeout'],
			[new CommandError('"lsof" failed', 'failed', '', 'Operation not permitted'), 'permission-denied'],
		];
		for (const [error, kind] of cases) {
			const { run } = fakeRunner({ lsof: error });
			await assert.rejects(new DarwinAdapter(run).listPorts(), (thrown: unknown) => thrown instanceof PortListingError && thrown.kind === kind, kind);
		}
	});
});
