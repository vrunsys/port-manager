import * as assert from 'assert';
import { killUnixProcess, UnixKillDeps } from '../../../features/ports/kill/unix-kill';

const TEST_PID = 4242;

const errno = (code: string) => Object.assign(new Error(code), { code });

interface FakeState {
	alive: boolean;
}

/** A process that reacts to the signals it receives; sleeping is instant. */
function fakeProcess(onSignal: (signal: string, state: FakeState) => void) {
	const state: FakeState = { alive: true };
	const signals: string[] = [];
	const deps: UnixKillDeps = {
		sendSignal(_pid, signal) {
			if (signal === 0) {
				if (!state.alive) {
					throw errno('ESRCH');
				}
				return;
			}
			signals.push(signal);
			onSignal(signal, state);
		},
		sleep: async () => {},
	};
	return { deps, signals };
}

suite('killUnixProcess', () => {
	test('stops a process that exits on SIGTERM without sending SIGKILL', async () => {
		const { deps, signals } = fakeProcess((signal, state) => {
			state.alive = signal !== 'SIGTERM';
		});
		const result = await killUnixProcess(TEST_PID, {}, deps);
		assert.strictEqual(result.status, 'killed');
		assert.deepStrictEqual(signals, ['SIGTERM']);
	});

	test('sends SIGKILL after the grace period when SIGTERM is ignored', async () => {
		const { deps, signals } = fakeProcess((signal, state) => {
			state.alive = signal !== 'SIGKILL';
		});
		const result = await killUnixProcess(TEST_PID, { gracePeriodMs: 300 }, deps);
		assert.strictEqual(result.status, 'killed');
		assert.deepStrictEqual(signals, ['SIGTERM', 'SIGKILL']);
	});

	test('goes straight to SIGKILL when forced', async () => {
		const { deps, signals } = fakeProcess((_signal, state) => {
			state.alive = false;
		});
		const result = await killUnixProcess(TEST_PID, { force: true }, deps);
		assert.strictEqual(result.status, 'killed');
		assert.deepStrictEqual(signals, ['SIGKILL']);
	});

	test('reports failed when the process survives SIGKILL', async () => {
		const { deps } = fakeProcess(() => {});
		const result = await killUnixProcess(TEST_PID, { gracePeriodMs: 200 }, deps);
		assert.strictEqual(result.status, 'failed');
		assert.match(result.message, /still running/);
	});

	test('maps ESRCH on the first signal to not-found', async () => {
		const { deps } = fakeProcess(() => {
			throw errno('ESRCH');
		});
		assert.strictEqual((await killUnixProcess(TEST_PID, {}, deps)).status, 'not-found');
	});

	test('maps EPERM to permission-denied', async () => {
		const { deps } = fakeProcess(() => {
			throw errno('EPERM');
		});
		assert.strictEqual((await killUnixProcess(TEST_PID, {}, deps)).status, 'permission-denied');
	});

	test('maps any other signal error to failed', async () => {
		const { deps } = fakeProcess(() => {
			throw errno('EINVAL');
		});
		assert.strictEqual((await killUnixProcess(TEST_PID, {}, deps)).status, 'failed');
	});

	test('counts a process that exits just before SIGKILL as killed', async () => {
		const { deps } = fakeProcess(signal => {
			if (signal === 'SIGKILL') {
				throw errno('ESRCH');
			}
		});
		assert.strictEqual((await killUnixProcess(TEST_PID, { gracePeriodMs: 200 }, deps)).status, 'killed');
	});

	test('does not count ESRCH as killed when SIGKILL was the first signal', async () => {
		const { deps } = fakeProcess(() => {
			throw errno('ESRCH');
		});
		assert.strictEqual((await killUnixProcess(TEST_PID, { force: true }, deps)).status, 'not-found');
	});

	test('never signals protected or invalid pids', async () => {
		for (const pid of [0, 1, -1, -TEST_PID, 1.5, NaN, process.pid]) {
			const { deps, signals } = fakeProcess(() => {});
			const result = await killUnixProcess(pid, {}, deps);
			assert.strictEqual(result.status, 'failed', `pid ${pid}`);
			assert.deepStrictEqual(signals, [], `pid ${pid}`);
		}
	});
});
