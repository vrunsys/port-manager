import { KillResult } from '../port-types';
import { failed } from './kill-results';

const SYSTEM_PID = 0;
const INIT_PID = 1;
const WINDOWS_SYSTEM_PID = 4;

export interface GuardEnvironment {
	platform?: NodeJS.Platform;
	/** The extension host running Port Manager. */
	ownPid?: number;
	/** The VS Code process that started the extension host (the server process when remote). */
	parentPid?: number;
}

/**
 * Why `pid` must never be signalled, or undefined if it may be. Anything that is not a positive
 * integer is refused too: process.kill(0) signals our whole process group and negative PIDs
 * signal other groups.
 */
export function describeSystemProcess(pid: number, environment: GuardEnvironment = {}): string | undefined {
	const { platform = process.platform, ownPid = process.pid, parentPid = process.ppid } = environment;
	if (pid === SYSTEM_PID) {
		return 'process 0 is the system itself, not a single process';
	}
	if (!Number.isInteger(pid) || pid < 0) {
		return `${pid} is not a valid process id`;
	}
	if (pid === INIT_PID) {
		return 'process 1 is the system init process';
	}
	if (platform === 'win32' && pid === WINDOWS_SYSTEM_PID) {
		return 'process 4 is the Windows System process';
	}
	if (pid === ownPid) {
		return 'it is the VS Code extension host that Port Manager runs in';
	}
	if (pid === parentPid) {
		return 'it is the VS Code process that started the extension host';
	}
	return undefined;
}

/** The last line of defence inside the kill implementations; the UI refuses these earlier. */
export function checkKillable(
	pid: number,
	ownPid: number = process.pid,
	platform: NodeJS.Platform = process.platform,
): KillResult | undefined {
	const reason = describeSystemProcess(pid, { ownPid, platform });
	return reason === undefined ? undefined : failed(`Refusing to stop process ${pid}: ${reason}.`);
}
