import * as assert from 'assert';
import { PortListingError } from '../../../../features/ports/port-types';
import { LinuxAdapter } from '../../../../features/ports/platform/linux/linux-adapter';
import { setLogSink } from '../../../../shared/logger';
import { CommandError, RunCommandOptions } from '../../../../shared/run-command';
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

	test('falls back to the next tool when one is installed but fails (e.g. no netlink in WSL1)', async () => {
		const broken = new CommandError('ss failed', 'failed', '', 'Cannot open netlink socket: Protocol not supported');
		const { run, calls } = fakeRunner({ ss: broken, lsof: linux.lsofFields, ps: linux.ps });
		const ports = await new LinuxAdapter(run).listPorts();
		assert.deepStrictEqual(calls, ['ss', 'lsof', 'ps']);
		assert.strictEqual(ports.length, 13);
	});

	test('says in the log why it moved on to the next tool', async () => {
		const warnings: string[] = [];
		setLogSink({ info: () => {}, warn: message => void warnings.push(message), error: () => {} });
		try {
			const broken = new CommandError('"ss" failed: netlink', 'failed', '', 'netlink');
			await new LinuxAdapter(fakeRunner({ ss: broken, lsof: linux.lsofFields, ps: linux.ps }).run).listPorts();
		} finally {
			setLogSink(undefined);
		}
		assert.deepStrictEqual(warnings, ['ss could not list ports, trying the next tool: "ss" failed: netlink']);
	});

	test('does not log a missing tool as a failure, since that is the normal case', async () => {
		const warnings: string[] = [];
		setLogSink({ info: () => {}, warn: message => void warnings.push(message), error: () => {} });
		try {
			await new LinuxAdapter(fakeRunner({ netstat: linux.netstat, ps: linux.ps }).run).listPorts();
		} finally {
			setLogSink(undefined);
		}
		assert.deepStrictEqual(warnings, []);
	});

	test('when every installed tool fails, reports the first (preferred) tool\'s failure with its kind', async () => {
		const first = new CommandError('"ss" failed', 'failed', '', 'Permission denied');
		const second = new CommandError('"lsof" failed', 'timeout', '', '');
		const { run, calls } = fakeRunner({ ss: first, lsof: second });
		await assert.rejects(new LinuxAdapter(run).listPorts(), (error: unknown) => {
			assert.ok(error instanceof PortListingError);
			assert.strictEqual(error.kind, 'permission-denied');
			return true;
		});
		assert.deepStrictEqual(calls, ['ss', 'lsof', 'netstat']);
	});

	test('reports tool-missing, as a typed error, only when no tool is installed', async () => {
		await assert.rejects(new LinuxAdapter(fakeRunner({}).run).listPorts(), (error: unknown) => error instanceof PortListingError && error.kind === 'tool-missing');
	});

	test('asks lsof for full command names and gives it extra time', async () => {
		const seen: Array<{ file: string; args: string[]; timeoutMs?: number }> = [];
		const run = async (file: string, args: string[], options?: RunCommandOptions): Promise<string> => {
			seen.push({ file, args, timeoutMs: options?.timeoutMs });
			if (file === 'ss') {
				throw new CommandError('ss missing', 'not-found', '', '');
			}
			return file === 'lsof' ? linux.lsofFields : linux.ps;
		};
		await new LinuxAdapter(run).listPorts();
		const lsof = seen.find(call => call.file === 'lsof');
		assert.ok(lsof?.args.join(' ').includes('+c 0'));
		assert.strictEqual(lsof?.timeoutMs, 15_000);
	});

	test('still lists the ports, without users and commands, when ps rejects -p (BusyBox on Alpine)', async () => {
		const busybox = new CommandError("ps: invalid option -- 'p'", 'failed', '', "ps: invalid option -- 'p'");
		const warnings: string[] = [];
		setLogSink({ info: () => {}, warn: message => void warnings.push(message), error: () => {} });
		try {
			const ports = await new LinuxAdapter(fakeRunner({ ss: linux.ss, ps: busybox }).run).listPorts();
			assert.strictEqual(ports.length, 17);
			assert.ok(ports.every(p => p.command === undefined && p.user === undefined));
			assert.match(warnings[0], /ps failed, so users and command lines are not shown/);
		} finally {
			setLogSink(undefined);
		}
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
		assert.strictEqual(hidden?.user, undefined);
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
