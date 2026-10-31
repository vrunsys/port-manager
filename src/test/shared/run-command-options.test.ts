import * as assert from 'assert';
import { englishMessagesEnvironment, runCommand } from '../../shared/run-command';

// execFile is replaced, so these tests see exactly what runCommand asks the operating system for.
const { execFile } = vi.hoisted(() => ({ execFile: vi.fn() }));
vi.mock('child_process', () => ({ execFile }));

interface ExecOptions {
	timeout: number;
	maxBuffer: number;
	windowsHide: boolean;
	env: NodeJS.ProcessEnv;
}

function lastCall(): { file: string; args: string[]; options: ExecOptions } {
	const [file, args, options] = execFile.mock.calls.at(-1) as [string, string[], ExecOptions];
	return { file, args, options };
}

/** Runs `task` as if the extension host ran on `platform`. */
async function onPlatform<T>(platform: NodeJS.Platform, task: () => Promise<T>): Promise<T> {
	const original = Object.getOwnPropertyDescriptor(process, 'platform')!;
	Object.defineProperty(process, 'platform', { value: platform });
	try {
		return await task();
	} finally {
		Object.defineProperty(process, 'platform', original);
	}
}

/** Sets environment variables for the duration of `task`; undefined removes one. */
async function withEnv<T>(variables: Record<string, string | undefined>, task: () => Promise<T>): Promise<T> {
	const before = Object.fromEntries(Object.keys(variables).map(key => [key, process.env[key]]));
	for (const [key, value] of Object.entries(variables)) {
		if (value === undefined) {
			delete process.env[key];
		} else {
			process.env[key] = value;
		}
	}
	try {
		return await task();
	} finally {
		for (const [key, value] of Object.entries(before)) {
			if (value === undefined) {
				delete process.env[key];
			} else {
				process.env[key] = value;
			}
		}
	}
}

beforeEach(() => {
	execFile.mockReset();
	execFile.mockImplementation((_file, _args, _options, callback: (error: null, stdout: string, stderr: string) => void) =>
		callback(null, 'some output', ''),
	);
});

suite('runCommand: what it asks execFile for', () => {
	test('runs the program directly with the arguments it was given, and returns stdout', async () => {
		const output = await runCommand('ss', ['-ltnp']);
		assert.strictEqual(output, 'some output');
		assert.deepStrictEqual([lastCall().file, lastCall().args], ['ss', ['-ltnp']]);
	});

	test('asks for no console window, on every platform', async () => {
		for (const platform of ['win32', 'linux', 'darwin'] as const) {
			await onPlatform(platform, () => runCommand('tool', []));
			assert.strictEqual(lastCall().options.windowsHide, true, platform);
		}
	});

	test('waits 5 seconds by default', async () => {
		await runCommand('tool', []);
		assert.strictEqual(lastCall().options.timeout, 5000);
	});

	test('passes a custom timeoutMs through', async () => {
		await runCommand('tool', [], { timeoutMs: 12_345 });
		assert.strictEqual(lastCall().options.timeout, 12_345);
	});

	test('limits how much output it keeps', async () => {
		await runCommand('tool', []);
		assert.strictEqual(lastCall().options.maxBuffer, 10 * 1024 * 1024);
	});
});

suite('runCommand: language of the tools', () => {
	test('on Linux and macOS asks for English messages', async () => {
		for (const platform of ['linux', 'darwin'] as const) {
			await withEnv({ LC_ALL: undefined }, () => onPlatform(platform, () => runCommand('netstat', ['-tlnp'])));
			const { env } = lastCall().options;
			assert.strictEqual(env.LC_MESSAGES, 'C', platform);
			assert.strictEqual(env.LANGUAGE, 'C', platform);
		}
	});

	test('keeps the rest of the environment', async () => {
		await withEnv({ PORT_MANAGER_TEST: 'kept', LC_ALL: undefined }, () => onPlatform('linux', () => runCommand('tool', [])));
		assert.strictEqual(lastCall().options.env.PORT_MANAGER_TEST, 'kept');
	});

	test('moves a user LC_ALL to LC_CTYPE, so messages are English and non-ASCII names still decode', async () => {
		await withEnv({ LC_ALL: 'de_DE.UTF-8' }, () => onPlatform('linux', () => runCommand('tool', [])));
		const { env } = lastCall().options;
		assert.strictEqual(env.LC_ALL, undefined);
		assert.strictEqual(env.LC_CTYPE, 'de_DE.UTF-8');
		assert.strictEqual(env.LC_MESSAGES, 'C');
	});

	test('does not change this process\'s own environment', async () => {
		await withEnv({ LC_ALL: 'de_DE.UTF-8', LANGUAGE: 'de' }, async () => {
			await onPlatform('linux', () => runCommand('tool', []));
			assert.strictEqual(process.env.LC_ALL, 'de_DE.UTF-8');
			assert.strictEqual(process.env.LANGUAGE, 'de');
			assert.strictEqual(process.env.LC_MESSAGES === 'C', false);
		});
	});

	test('on Windows hands over the environment untouched', async () => {
		await onPlatform('win32', () => runCommand('netstat', ['-ano']));
		assert.strictEqual(lastCall().options.env, process.env);
	});
});

suite('englishMessagesEnvironment', () => {
	test('drops LC_ALL and gives its value to LC_CTYPE', () => {
		const env = englishMessagesEnvironment({ LC_ALL: 'fr_FR.UTF-8', PATH: '/usr/bin' });
		assert.deepStrictEqual(env, { PATH: '/usr/bin', LC_MESSAGES: 'C', LANGUAGE: 'C', LC_CTYPE: 'fr_FR.UTF-8' });
		assert.ok(!('LC_ALL' in env));
	});

	test('does not modify the object it is given, and returns a new one', () => {
		const input = { LC_ALL: 'fr_FR.UTF-8', LANGUAGE: 'fr', PATH: '/usr/bin' };
		const snapshot = { ...input };
		const output = englishMessagesEnvironment(input);
		assert.deepStrictEqual(input, snapshot);
		assert.notStrictEqual(output, input);
	});

	test('leaves an existing LC_CTYPE alone when there is no LC_ALL', () => {
		const env = englishMessagesEnvironment({ LC_CTYPE: 'en_GB.UTF-8' });
		assert.strictEqual(env.LC_CTYPE, 'en_GB.UTF-8');
		assert.strictEqual(env.LC_ALL, undefined);
	});

	test('overrides messages the user had set to another language', () => {
		const env = englishMessagesEnvironment({ LC_MESSAGES: 'de_DE.UTF-8', LANGUAGE: 'de:en' });
		assert.deepStrictEqual([env.LC_MESSAGES, env.LANGUAGE], ['C', 'C']);
	});
});
