import * as assert from 'assert';
import { LinuxAdapter } from '../../../../features/ports/platform/linux/linux-adapter';
import { UNKNOWN_LABEL } from '../../../../features/ports/port-types';
import { CommandError } from '../../../../shared/run-command';
import { linux } from '../../../fixtures/load-fixtures';

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
		const { run, calls } = fakeRunner({ ss: linux.ss, lsof: linux.lsofFields, ps: linux.ps });
		const ports = await new LinuxAdapter(run).listPorts();
		assert.deepStrictEqual(calls, ['ss', 'ps']);
		assert.strictEqual(ports.length, 17);
	});

	test('falls back to lsof when ss is missing', async () => {
		const { run, calls } = fakeRunner({ lsof: linux.lsofFields, ps: linux.ps });
		const ports = await new LinuxAdapter(run).listPorts();
		assert.deepStrictEqual(calls, ['ss', 'lsof', 'ps']);
		assert.strictEqual(ports.length, 13);
	});

	test('falls back to netstat when ss and lsof are missing', async () => {
		const { run, calls } = fakeRunner({ netstat: linux.netstat, ps: linux.ps });
		const ports = await new LinuxAdapter(run).listPorts();
		assert.deepStrictEqual(calls, ['ss', 'lsof', 'netstat', 'ps']);
		assert.strictEqual(ports.length, 17);
	});

	test('fails with a clear message when no tool is installed', async () => {
		const { run } = fakeRunner({});
		await assert.rejects(new LinuxAdapter(run).listPorts(), /none of ss, lsof, netstat is installed/);
	});

	test('does not fall back when a tool is installed but fails', async () => {
		const broken = new CommandError('ss failed', 'failed', '', 'permission denied');
		const { run, calls } = fakeRunner({ ss: broken, lsof: linux.lsofFields });
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
		const { run } = fakeRunner({ ss: linux.ss, ps: linux.ps });
		const ports = await new LinuxAdapter(run).listPorts();
		const helper = ports.find(p => p.port === 18101);
		assert.strictEqual(helper?.user, 'dev');
		assert.match(helper?.command ?? '', /\/bin\/node -e /);
		const hidden = ports.find(p => p.port === 631 && p.address === '127.0.0.1');
		assert.strictEqual(hidden?.pid, undefined);
		assert.strictEqual(hidden?.user, UNKNOWN_LABEL);
		assert.strictEqual(hidden?.command, undefined);
	});

	test('asks ps only about the pids it found, each once', async () => {
		const asked: string[][] = [];
		const run = async (file: string, args: string[]): Promise<string> => {
			if (file === 'ps') {
				asked.push(args);
				return linux.ps;
			}
			return linux.ss;
		};
		await new LinuxAdapter(run).listPorts();
		assert.strictEqual(asked.length, 1);
		const pids = asked[0][asked[0].indexOf('-p') + 1].split(',').map(Number);
		assert.deepStrictEqual(pids.sort((a, b) => a - b), [1691, 1695, 8146, 8227, 9374, 31368, 31375]);
	});

	test('keeps the user lsof reported instead of overwriting it', async () => {
		const { run } = fakeRunner({ lsof: linux.lsofFields, ps: '  1691 other /bin/kdeconnectd\n' });
		const ports = await new LinuxAdapter(run).listPorts();
		const kde = ports.find(p => p.pid === 1691);
		assert.strictEqual(kde?.user, 'dev');
		assert.strictEqual(kde?.command, '/bin/kdeconnectd');
	});
});
