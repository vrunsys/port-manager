import * as vscode from 'vscode';
import { createPlatformAdapter } from './features/ports/platform-adapter-factory';
import { PollingDemand } from './features/ports/polling-demand';
import { PlatformAdapter } from './features/ports/port-types';
import { PortsService } from './features/ports/ports-service';
import { registerPortActions } from './features/ports/register-port-actions';
import { registerPortsView } from './features/ports/register-ports-view';
import { registerStatusBar } from './features/ports/register-status-bar';
import { UnsupportedAdapter } from './features/ports/unsupported-adapter';
import { VscodeSettings } from './features/ports/vscode-settings';

function createAdapter(): PlatformAdapter {
	try {
		return createPlatformAdapter();
	} catch (error) {
		return new UnsupportedAdapter(error instanceof Error ? error : new Error(String(error)));
	}
}

export function activate(context: vscode.ExtensionContext) {
	const settings = new VscodeSettings();
	const service = new PortsService(createAdapter(), { intervalMs: settings.get().refreshIntervalMs });
	const demand = new PollingDemand(service);
	context.subscriptions.push(
		settings,
		{ dispose: () => service.dispose() },
		settings.onDidChange(current => service.setIntervalMs(current.refreshIntervalMs)),
		registerPortsView(service, demand, settings),
		registerStatusBar(service, demand, settings),
		registerPortActions(service, settings),
	);
}

export function deactivate() {}
