import * as assert from 'assert';
import { DarwinAdapter } from '../features/ports/darwin/darwin-adapter';
import { CommandError } from '../shared/run-command';
import { MACOS_LSOF_TABLE_OUTPUT, MACOS_PS_OUTPUT } from './fixtures/port-tool-output';

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
		const { run, calls } = fakeRunner({ lsof: MACOS_LSOF_TABLE_OUTPUT, ps: MACOS_PS_OUTPUT });
		const ports = await new DarwinAdapter(run).listPorts();
		assert.deepStrictEqual(calls[0], ['lsof', ['-iTCP', '-sTCP:LISTEN', '-nP']]);
		assert.strictEqual(calls[1][0], 'ps');
		assert.strictEqual(ports.length, 7);
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
