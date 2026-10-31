import * as assert from 'assert';
import { ChildProcess, spawn } from 'child_process';
import { createPlatformAdapter } from '../../../features/ports/platform/platform-adapter-factory';

const STAY_ALIVE = 'setInterval(() => {}, 1000);';
const IGNORE_SIGTERM = `process.on('SIGTERM', () => {}); ${STAY_ALIVE}`;
const TEST_TIMEOUT_MS = 15_000;
const SHORT_GRACE_MS = 300;

interface Exit {
	code: number | null;
	signal: NodeJS.Signals | null;
}

/** Starts a real node process and resolves once its script has finished setting up. */
async function startChild(setup: string): Promise<{ child: ChildProcess; exited: Promise<Exit> }> {
	const child = spawn(process.execPath, ['-e', `${setup} console.log('ready');`], {
		stdio: ['ignore', 'pipe', 'ignore'],
		windowsHide: true,
	});
	const exited = new Promise<Exit>(resolve => child.once('exit', (code, signal) => resolve({ code, signal })));
	await new Promise<void>((resolve, reject) => {
		child.stdout?.once('data', () => resolve());
		child.once('error', reject);
	});
	return { child, exited };
}

/** These really kill processes, on whichever OS runs the suite (taskkill on Windows, signals elsewhere). */
suite('killProcess with a real process', { timeout: TEST_TIMEOUT_MS }, () => {
	const adapter = createPlatformAdapter();
	let running: ChildProcess | undefined;

	afterEach(() => {
		running?.kill('SIGKILL');
		running = undefined;
	});

	test('stops a running process', async () => {
		const { child, exited } = await startChild(STAY_ALIVE);
		running = child;
		const result = await adapter.killProcess(child.pid!);
		await exited;
		assert.strictEqual(result.status, 'killed');
	});

	test('reports not-found for a process that already exited', async () => {
		const { child, exited } = await startChild('');
		running = child;
		await exited;
		const result = await adapter.killProcess(child.pid!);
		assert.strictEqual(result.status, 'not-found');
	});

	// Windows has no SIGTERM step: taskkill /F ends the process at once.
	test.skipIf(process.platform === 'win32')('escalates to SIGKILL for a process that ignores SIGTERM', async () => {
		const { child, exited } = await startChild(IGNORE_SIGTERM);
		running = child;
		const result = await adapter.killProcess(child.pid!, { gracePeriodMs: SHORT_GRACE_MS });
		const exit = await exited;
		assert.strictEqual(result.status, 'killed');
		assert.strictEqual(exit.signal, 'SIGKILL');
	});

	test('refuses to stop the extension host itself', async () => {
		const result = await adapter.killProcess(process.pid);
		assert.strictEqual(result.status, 'failed');
	});
});
