import * as assert from 'assert';
import { DarwinAdapter } from '../../../../features/ports/platform/darwin/darwin-adapter';
import { CommandError } from '../../../../shared/run-command';
import { macos } from '../../../fixtures/load-fixtures';

function fakeRunner(responses: Record<string, string | CommandError>) {
	const calls: Array<[string, string[]]> = [];
	const run = async (file: string, args: string[]): Promise<string> => {
		calls.push([file, args]);
		const response = responses[file];
		if (response instanceof CommandError) {
			throw response;
		}
		return response ?? '';
	};
	return { run, calls };
}

suite('DarwinAdapter.listPorts', () => {
	test('runs lsof with the listening-TCP arguments, then ps for command lines', async () => {
		const { run, calls } = fakeRunner({ lsof: macos.lsofTable, ps: macos.ps });
		const ports = await new DarwinAdapter(run).listPorts();
		assert.deepStrictEqual(calls[0], ['lsof', ['-iTCP', '-sTCP:LISTEN', '-nP']]);
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
});
