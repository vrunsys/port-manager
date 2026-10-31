import { executableName, normalizeProcessName } from '../../../shared/process-names';
import { PortInfo } from '../port-types';
import { PortSettings, SETTING } from '../settings/port-settings';
import { describeCriticalProcess } from './critical-processes';
import { describeSystemProcess, GuardEnvironment } from './kill-guards';

/**
 * Why this port is protected by the user's settings, or undefined if it is not. A process matches by the
 * name the OS reports or by its executable (some runtimes, like node, report a different thread name).
 */
export function describeProtection(info: PortInfo, settings: PortSettings): string | undefined {
	if (settings.protectedPorts.includes(info.port)) {
		return `port ${info.port} is listed in portManager.${SETTING.protectedPorts}`;
	}
	const names = [info.processName ? normalizeProcessName(info.processName) : '', info.command ? executableName(info.command) : ''];
	const match = names.find(name => name !== '' && settings.protectedProcesses.includes(name));
	return match === undefined ? undefined : `"${match}" is listed in portManager.${SETTING.protectedProcesses}`;
}

/** Why Port Manager refuses to stop this port's process (settings, system processes, critical processes), or undefined. */
export function whyNotKillable(info: PortInfo, settings: PortSettings, environment: GuardEnvironment = {}): string | undefined {
	return (
		describeProtection(info, settings) ??
		(info.pid === undefined ? undefined : describeSystemProcess(info.pid, environment)) ??
		describeCriticalProcess(info, environment.platform ?? process.platform)
	);
}

const TRUNCATED_USER_LENGTH = 8;
const withoutPlus = (name: string): string => (name.endsWith('+') ? name.slice(0, -1) : name);

/** BSD ps and lsof cut long user names to 8 characters (ps may end the cut name in "+"). */
function isCutOf(shortName: string, fullName: string): boolean {
	const looksCut = shortName.endsWith('+') || shortName.length === TRUNCATED_USER_LENGTH;
	return looksCut && fullName.startsWith(withoutPlus(shortName));
}

/** Equal, or one is the cut-off form of the other. Only the shorter, cut name may match, so "root" is not "rootless". */
function sameUser(a: string, b: string): boolean {
	const first = a.toLowerCase();
	const second = b.toLowerCase();
	return first === second || isCutOf(first, second) || isCutOf(second, first);
}

/** False when either side is unknown (Windows does not report users), so no warning is invented. */
export function isOwnedByAnotherUser(info: PortInfo, currentUser: string | undefined): boolean {
	if (!currentUser || info.user === undefined) {
		return false;
	}
	return !sameUser(info.user, currentUser);
}
