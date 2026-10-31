import { checkKillable } from '../../kill/kill-guards';
import { failed, fromSignalError, killed } from '../../kill/kill-results';
import { KillOptions, KillResult } from '../../port-types';
import { readProcessState } from './process-state';

const DEFAULT_GRACE_PERIOD_MS = 3000;
const POLL_INTERVAL_MS = 100;
const AFTER_SIGKILL_WAIT_MS = 1000;
/** Signal 0 only checks that the process exists and can be signalled. */
const EXISTENCE_CHECK = 0;

export interface UnixKillDeps {
	sendSignal(pid: number, signal: NodeJS.Signals | typeof EXISTENCE_CHECK): void;
	sleep(ms: number): Promise<void>;
	/** A zombie has exited but is not yet reaped by its parent; it still answers signal 0 and holds no ports. */
	isZombie(pid: number): boolean;
}

const systemDeps: UnixKillDeps = {
	sendSignal: (pid, signal) => process.kill(pid, signal),
	sleep: ms => new Promise(resolve => setTimeout(resolve, ms)),
	isZombie: pid => readProcessState(pid) === 'Z',
};

function isAlive(deps: UnixKillDeps, pid: number): boolean {
	try {
		deps.sendSignal(pid, EXISTENCE_CHECK);
	} catch (error) {
		// EPERM still means the process exists, we just may not signal it.
		return (error as NodeJS.ErrnoException).code !== 'ESRCH';
	}
	return !deps.isZombie(pid);
}

async function waitForExit(deps: UnixKillDeps, pid: number, timeoutMs: number): Promise<boolean> {
	for (let waited = 0; waited < timeoutMs; waited += POLL_INTERVAL_MS) {
		if (!isAlive(deps, pid)) {
			return true;
		}
		await deps.sleep(POLL_INTERVAL_MS);
	}
	return !isAlive(deps, pid);
}

/** Returns a result only when the signal could not be delivered. */
function trySend(deps: UnixKillDeps, pid: number, signal: NodeJS.Signals): KillResult | undefined {
	try {
		deps.sendSignal(pid, signal);
		return undefined;
	} catch (error) {
		return fromSignalError(error, pid);
	}
}

/** SIGTERM, wait up to the grace period, then SIGKILL. `force` goes straight to SIGKILL. */
export async function killUnixProcess(
	pid: number,
	options: KillOptions = {},
	deps: UnixKillDeps = systemDeps,
): Promise<KillResult> {
	const refusal = checkKillable(pid);
	if (refusal) {
		return refusal;
	}
	if (!options.force) {
		const termError = trySend(deps, pid, 'SIGTERM');
		if (termError) {
			return termError;
		}
		if (await waitForExit(deps, pid, options.gracePeriodMs ?? DEFAULT_GRACE_PERIOD_MS)) {
			return killed(pid);
		}
	}
	const killError = trySend(deps, pid, 'SIGKILL');
	if (killError) {
		// Exiting between the last check and SIGKILL is success, but only after SIGTERM was sent.
		return killError.status === 'not-found' && !options.force ? killed(pid) : killError;
	}
	return (await waitForExit(deps, pid, AFTER_SIGKILL_WAIT_MS))
		? killed(pid)
		: failed(`Process ${pid} is still running after SIGKILL.`);
}
