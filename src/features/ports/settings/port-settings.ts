import { isValidPort } from '../../../shared/port-number';
import { normalizeProcessName } from '../../../shared/process-names';

/** Must match the settings contributed in package.json. */
export const SETTINGS_SECTION = 'portManager';
export const SETTING = {
	refreshInterval: 'refreshInterval',
	confirmBeforeKill: 'confirmBeforeKill',
	protectedPorts: 'protectedPorts',
	protectedProcesses: 'protectedProcesses',
	showStatusBar: 'showStatusBar',
} as const;

const DEFAULT_REFRESH_INTERVAL_SECONDS = 2;
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
