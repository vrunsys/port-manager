import * as vscode from 'vscode';
import { createPlatformAdapter } from './features/ports/platform-adapter-factory';
import { PlatformAdapter } from './features/ports/port-types';
import { PortsService } from './features/ports/ports-service';
import { registerPortActions } from './features/ports/register-port-actions';
import { registerPortsView } from './features/ports/register-ports-view';
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
	context.subscriptions.push(
		{ dispose: () => service.dispose() },
		registerPortsView(service),
		registerPortActions(service),
	);
}

export function deactivate() {}
