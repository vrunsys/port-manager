import { executableName, normalizeProcessName } from '../../../shared/process-names';
import { PortInfo } from '../port-types';

/**
 * Processes whose loss takes the machine or the user's session down. Unlike protectedProcesses, this list
 * cannot be switched off: stopping any of these from a port list is never what anyone wants.
 */
const CRITICAL_PROCESSES: Partial<Record<NodeJS.Platform, readonly string[]>> = {
	win32: ['system', 'registry', 'smss', 'csrss', 'wininit', 'winlogon', 'services', 'lsass', 'lsm', 'svchost'],
	darwin: ['launchd', 'windowserver', 'loginwindow', 'kernel_task', 'coreservicesd', 'opendirectoryd'],
	linux: ['systemd', 'init', 'xorg', 'xwayland', 'gnome-shell', 'dbus-daemon', 'dbus-broker', 'gdm', 'gdm3', 'sddm', 'lightdm'],
};

const OS_NAMES: Partial<Record<NodeJS.Platform, string>> = { win32: 'Windows', darwin: 'macOS', linux: 'the desktop session and the system' };

export function describeCriticalProcess(info: Pick<PortInfo, 'processName' | 'command'>, platform: NodeJS.Platform): string | undefined {
	const critical = CRITICAL_PROCESSES[platform];
	if (!critical) {
		return undefined;
	}
	const names = [info.processName ? normalizeProcessName(info.processName) : '', info.command ? executableName(info.command) : ''];
	const match = names.find(name => name !== '' && critical.includes(name));
	return match === undefined ? undefined : `"${match}" is critical to ${OS_NAMES[platform]}; stopping it can crash or log out the machine`;
}
