import { DEFAULT_SETTINGS, PortSettings, SettingsSource } from '../../features/ports/settings/port-settings';

/** Settings the test can change, with the change event the extension listens to. */
export function fakeSettings(initial: Partial<PortSettings> = {}): SettingsSource & { update(changes: Partial<PortSettings>): void } {
	let current: PortSettings = { ...DEFAULT_SETTINGS, ...initial };
	const listeners = new Set<(settings: PortSettings) => void>();
	return {
		get: () => current,
		onDidChange(listener) {
			listeners.add(listener);
			return { dispose: () => void listeners.delete(listener) };
		},
		update(changes) {
			current = { ...current, ...changes };
			[...listeners].forEach(listener => listener(current));
		},
	};
}
