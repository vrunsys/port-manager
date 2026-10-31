import { isValidPort } from '../platform/parsers/parse-host-port';
import { PortInfo } from '../port-types';

/** Must match the settings contributed in package.json. */
export const SETTINGS_SECTION = 'portManager';
export const SETTING = {
	refreshInterval: 'refreshInterval',
	confirmBeforeKill: 'confirmBeforeKill',
	protectedPorts: 'protectedPorts',
	protectedProcesses: 'protectedProcesses',
	showStatusBar: 'showStatusBar',
} as const;

export const DEFAULT_REFRESH_INTERVAL_SECONDS = 2;
export const MIN_REFRESH_INTERVAL_SECONDS = 1;
export const MAX_REFRESH_INTERVAL_SECONDS = 600;
const MS_PER_SECOND = 1000;

export interface PortSettings {
	refreshIntervalMs: number;
	confirmBeforeKill: boolean;
	protectedPorts: readonly number[];
	/** Lower-case names without ".exe", ready for comparison. */
	protectedProcesses: readonly string[];
	showStatusBar: boolean;
}

export interface SettingsSource {
	get(): PortSettings;
	/** Calls the listener whenever any Port Manager setting changed. */
	onDidChange(listener: (settings: PortSettings) => void): { dispose(): void };
}

export const DEFAULT_SETTINGS: PortSettings = {
	refreshIntervalMs: DEFAULT_REFRESH_INTERVAL_SECONDS * MS_PER_SECOND,
	confirmBeforeKill: true,
	protectedPorts: [],
	protectedProcesses: [],
	showStatusBar: true,
};

/** The comparison form of a process name: case and a ".exe" suffix do not matter. */
export function normalizeProcessName(name: string): string {
	return name.trim().toLowerCase().replace(/\.exe$/, '');
}

function readBoolean(value: unknown, fallback: boolean): boolean {
	return typeof value === 'boolean' ? value : fallback;
}

function readIntervalMs(value: unknown): number {
	const seconds = typeof value === 'number' && Number.isFinite(value) ? value : DEFAULT_REFRESH_INTERVAL_SECONDS;
	const clamped = Math.min(Math.max(seconds, MIN_REFRESH_INTERVAL_SECONDS), MAX_REFRESH_INTERVAL_SECONDS);
	return Math.round(clamped * MS_PER_SECOND);
}

function readPorts(value: unknown): number[] {
	return Array.isArray(value) ? [...new Set(value.filter(isValidPort))] : [];
}

function readProcessNames(value: unknown): string[] {
	if (!Array.isArray(value)) {
		return [];
	}
	const names = value.filter((item): item is string => typeof item === 'string').map(normalizeProcessName);
	return [...new Set(names.filter(name => name !== ''))];
}

/** Turns raw configuration values into safe settings; wrong types and out-of-range values never get through. */
export function normalizeSettings(get: (key: string) => unknown): PortSettings {
	return {
		refreshIntervalMs: readIntervalMs(get(SETTING.refreshInterval)),
		confirmBeforeKill: readBoolean(get(SETTING.confirmBeforeKill), DEFAULT_SETTINGS.confirmBeforeKill),
		protectedPorts: readPorts(get(SETTING.protectedPorts)),
		protectedProcesses: readProcessNames(get(SETTING.protectedProcesses)),
		showStatusBar: readBoolean(get(SETTING.showStatusBar), DEFAULT_SETTINGS.showStatusBar),
	};
}

/**
 * The executable's file name. `ps` shows "/usr/bin/node server.js", Windows shows a path that may
 * contain spaces, and some daemons rewrite their title ("sshd: user@pts/0").
 */
function executableName(command: string): string {
	const executable = /\.exe$/i.test(command.trim()) ? command.trim() : command.trim().split(/\s+/)[0];
	return normalizeProcessName(executable.replace(/:$/, '').replace(/^.*[\\/]/, ''));
}

/**
 * Why this port must not be stopped, or undefined if it may be. A process matches by the name the
 * OS reports or by its executable (some runtimes, like node, report a different thread name).
 */
export function describeProtection(info: PortInfo, settings: PortSettings): string | undefined {
	if (settings.protectedPorts.includes(info.port)) {
		return `port ${info.port} is listed in portManager.${SETTING.protectedPorts}`;
	}
	const names = [normalizeProcessName(info.processName), info.command ? executableName(info.command) : ''];
	const match = names.find(name => name !== '' && settings.protectedProcesses.includes(name));
	return match === undefined ? undefined : `"${match}" is listed in portManager.${SETTING.protectedProcesses}`;
}
