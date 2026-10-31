import * as assert from 'assert';
import { CommandError, runCommand } from '../shared/run-command';

suite('runCommand', () => {
	test('returns stdout of a successful command', async () => {
		const output = await runCommand(process.execPath, ['-e', 'process.stdout.write("hello")']);
		assert.strictEqual(output, 'hello');
	});

	test('passes arguments literally without a shell', async () => {
		const output = await runCommand(process.execPath, ['-p', '"a; echo injected"']);
		assert.strictEqual(output.trim(), 'a; echo injected');
	});

	test('reports a missing program as not-found', async () => {
		await assert.rejects(runCommand('port-manager-no-such-binary', []), (error: unknown) => {
			assert.ok(error instanceof CommandError);
			assert.strictEqual(error.failure, 'not-found');
			return true;
		});
	});

	test('keeps stdout when the command exits non-zero', async () => {
		const script = 'process.stdout.write("partial"); process.exit(1)';
		await assert.rejects(runCommand(process.execPath, ['-e', script]), (error: unknown) => {
			assert.ok(error instanceof CommandError);
			assert.strictEqual(error.failure, 'failed');
			assert.strictEqual(error.stdout, 'partial');
			return true;
		});
	});

	test('times out a command that runs too long', async () => {
		await assert.rejects(
			runCommand(process.execPath, ['-e', 'setTimeout(() => {}, 10000)'], { timeoutMs: 100 }),
			(error: unknown) => {
				assert.ok(error instanceof CommandError);
				assert.strictEqual(error.failure, 'timeout');
				return true;
			},
		);
	});
});
