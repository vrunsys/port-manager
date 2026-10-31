import * as vscode from 'vscode';
import { normalizeSettings, PortSettings, SETTINGS_SECTION, SettingsSource } from './port-settings';

/** Reads the portManager.* settings every time they are asked for, so changes apply without a reload. */
export class VscodeSettings implements SettingsSource, vscode.Disposable {
	private readonly emitter = new vscode.EventEmitter<PortSettings>();
	private readonly subscription: vscode.Disposable;

	constructor() {
		this.subscription = vscode.workspace.onDidChangeConfiguration(event => {
			if (event.affectsConfiguration(SETTINGS_SECTION)) {
				this.emitter.fire(this.get());
			}
		});
	}

	get(): PortSettings {
		const configuration = vscode.workspace.getConfiguration(SETTINGS_SECTION);
		return normalizeSettings(key => configuration.get(key));
	}

	onDidChange(listener: (settings: PortSettings) => void): { dispose(): void } {
		return this.emitter.event(listener);
	}

	dispose(): void {
		this.subscription.dispose();
		this.emitter.dispose();
	}
}
