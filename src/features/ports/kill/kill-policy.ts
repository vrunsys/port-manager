import { describeProtection, PortSettings } from '../port-settings';
import { PortInfo, UNKNOWN_LABEL } from '../port-types';
import { describeSystemProcess, GuardEnvironment } from './kill-guards';

/** Why Port Manager refuses to stop this port's process, or undefined if it may be stopped. */
export function whyNotKillable(
	info: PortInfo,
	settings: PortSettings,
	environment: GuardEnvironment = {},
): string | undefined {
	const configured = describeProtection(info, settings);
	if (configured) {
		return configured;
	}
	return info.pid === undefined ? undefined : describeSystemProcess(info.pid, environment);
}

/** False when either side is unknown (Windows does not report users), so no warning is invented. */
export function isOwnedByAnotherUser(info: PortInfo, currentUser: string | undefined): boolean {
	if (!currentUser || info.user === UNKNOWN_LABEL) {
		return false;
	}
	return info.user.toLowerCase() !== currentUser.toLowerCase();
}
