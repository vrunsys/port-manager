import { KillResult } from '../port-types';
import { failed } from './kill-results';

const INIT_PID = 1;

/**
 * Returns a refusal if `pid` must never be signalled, otherwise undefined.
 * Besides PID 0 and 1, anything that is not a positive integer is refused:
 * process.kill(0) signals our whole process group and negative PIDs signal other groups.
 */
export function checkKillable(pid: number, ownPid: number = process.pid): KillResult | undefined {
	if (!Number.isInteger(pid) || pid <= 0) {
		return failed(`Refusing to stop invalid process id ${pid}.`);
	}
	if (pid === INIT_PID) {
		return failed('Refusing to stop process 1 (the system init process).');
	}
	if (pid === ownPid) {
		return failed('Refusing to stop the VS Code extension host that Port Manager runs in.');
	}
	return undefined;
}
