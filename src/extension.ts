import * as vscode from 'vscode';
import { createPlatformAdapter } from './features/ports/platform-adapter-factory';
import { PollingDemand } from './features/ports/polling-demand';
import { PlatformAdapter } from './features/ports/port-types';
import { PortsService } from './features/ports/ports-service';
import { registerPortActions } from './features/ports/register-port-actions';
import { registerPortsView } from './features/ports/register-ports-view';
import { registerStatusBar } from './features/ports/register-status-bar';
import { UnsupportedAdapter } from './features/ports/unsupported-adapter';

function createAdapter(): PlatformAdapter {
	try {
		return createPlatformAdapter();
	} catch (error) {
		return new UnsupportedAdapter(error instanceof Error ? error : new Error(String(error)));
	}
}

export function activate(context: vscode.ExtensionContext) {
	const service = new PortsService(createAdapter());
	const demand = new PollingDemand(service);
	context.subscriptions.push(
		{ dispose: () => service.dispose() },
		registerPortsView(service, demand),
		registerStatusBar(service, demand),
		registerPortActions(service),
	);
}

export function deactivate() {}
