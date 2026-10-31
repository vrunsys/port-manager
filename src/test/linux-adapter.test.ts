import * as assert from 'assert';
import { LinuxAdapter } from '../features/ports/linux/linux-adapter';
import { UNKNOWN_LABEL } from '../features/ports/port-types';
import { CommandError } from '../shared/run-command';
import { LSOF_OUTPUT, NETSTAT_OUTPUT, PS_OUTPUT, SS_OUTPUT } from './fixtures/port-tool-output';

type Response = string | CommandError;

const missing = (file: string) => new CommandError(`${file} missing`, 'not-found', '', '');

/** Answers per program name and records the order programs were started in. */
function fakeRunner(responses: Record<string, Response>) {
	const calls: string[] = [];
	const run = async (file: string): Promise<string> => {
		calls.push(file);
		const response = responses[file] ?? missing(file);
		if (response instanceof CommandError) {
			throw response;
		}
		return response;
	};
	return { run, calls };
}

suite('LinuxAdapter.listPorts', () => {
	test('uses ss when it is installed and never tries the others', async () => {
		const { run, calls } = fakeRunner({ ss: SS_OUTPUT, lsof: LSOF_OUTPUT, ps: PS_OUTPUT });
		const ports = await new LinuxAdapter(run).listPorts();
		assert.deepStrictEqual(calls, ['ss', 'ps']);
		assert.strictEqual(ports.length, 7);
	});

	test('falls back to lsof when ss is missing', async () => {
		const { run, calls } = fakeRunner({ lsof: LSOF_OUTPUT, ps: PS_OUTPUT });
		await new LinuxAdapter(run).listPorts();
		assert.deepStrictEqual(calls, ['ss', 'lsof', 'ps']);
	});

	test('falls back to netstat when ss and lsof are missing', async () => {
		const { run, calls } = fakeRunner({ netstat: NETSTAT_OUTPUT, ps: PS_OUTPUT });
		const ports = await new LinuxAdapter(run).listPorts();
		assert.deepStrictEqual(calls, ['ss', 'lsof', 'netstat', 'ps']);
		assert.strictEqual(ports.length, 4);
	});

	test('fails with a clear message when no tool is installed', async () => {
		const { run } = fakeRunner({});
		await assert.rejects(new LinuxAdapter(run).listPorts(), /none of ss, lsof, netstat is installed/);
	});

	test('does not fall back when a tool is installed but fails', async () => {
		const broken = new CommandError('ss failed', 'failed', '', 'permission denied');
		const { run, calls } = fakeRunner({ ss: broken, lsof: LSOF_OUTPUT });
		await assert.rejects(new LinuxAdapter(run).listPorts(), /ss failed/);
		assert.deepStrictEqual(calls, ['ss']);
	});

	test('treats a non-zero exit with empty output as no ports', async () => {
		const noMatch = new CommandError('exit 1', 'failed', '', '');
		const { run, calls } = fakeRunner({ ss: noMatch });
		assert.deepStrictEqual(await new LinuxAdapter(run).listPorts(), []);
		assert.deepStrictEqual(calls, ['ss']);
	});

	test('adds user and command from ps, and keeps hidden-process rows as unknown', async () => {
		const { run } = fakeRunner({ ss: SS_OUTPUT, ps: PS_OUTPUT });
		const ports = await new LinuxAdapter(run).listPorts();
		const node = ports.find(p => p.port === 3000);
		assert.strictEqual(node?.user, 'varun');
		assert.strictEqual(node?.command, 'node server.js --port 3000');
		const hidden = ports.find(p => p.port === 5432);
		assert.strictEqual(hidden?.pid, undefined);
		assert.strictEqual(hidden?.user, UNKNOWN_LABEL);
	});

	test('keeps the user lsof reported instead of overwriting it', async () => {
		const { run } = fakeRunner({ lsof: LSOF_OUTPUT, ps: '  612 other  /bin/resolved\n' });
		const ports = await new LinuxAdapter(run).listPorts();
		assert.strictEqual(ports[0].user, 'systemd-resolve');
		assert.strictEqual(ports[0].command, '/bin/resolved');
	});
});
