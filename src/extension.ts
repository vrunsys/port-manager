import * as vscode from 'vscode';
import { setLogSink } from './shared/logger';
import { registerPortActions } from './features/ports/actions/register-port-actions';
import { whyNotKillable } from './features/ports/kill/kill-policy';
import { createPlatformAdapter } from './features/ports/platform/platform-adapter-factory';
import { UnsupportedAdapter } from './features/ports/platform/unsupported-adapter';
import { PlatformAdapter } from './features/ports/port-types';
import { PollingDemand } from './features/ports/service/polling-demand';
import { PortsService } from './features/ports/service/ports-service';
import { VscodeSettings } from './features/ports/settings/vscode-settings';
import { LabelStore } from './features/ports/view/port-labels';
import { registerPortsView } from './features/ports/view/register-ports-view';
import { registerStatusBar } from './features/ports/view/register-status-bar';
import { ViewOptions } from './features/ports/view/view-options';

function createAdapter(): PlatformAdapter {
	try {
		return createPlatformAdapter();
	} catch (error) {
		return new UnsupportedAdapter(error instanceof Error ? error : new Error(String(error)));
	}
}

export function activate(context: vscode.ExtensionContext) {
	// Diagnostics (a failing tool, a fallback, a refused kill) go to Output > Port Manager.
	const log = vscode.window.createOutputChannel('Port Manager', { log: true });
	setLogSink(log);

	const settings = new VscodeSettings();
	const service = new PortsService(createAdapter(), {
		intervalMs: settings.get().refreshIntervalMs,
		// Checked again inside the service right before every kill, whoever asks.
		killPolicy: info => whyNotKillable(info, settings.get()),
	});
	const demand = new PollingDemand(service);
	demand.setWindowFocused(vscode.window.state.focused);
	const labels = new LabelStore(context.globalState);
	const options = new ViewOptions(context.globalState);
	context.subscriptions.push(
		log,
		{ dispose: () => setLogSink(undefined) },
		settings,
		{ dispose: () => service.dispose() },
		settings.onDidChange(current => service.setIntervalMs(current.refreshIntervalMs)),
		vscode.window.onDidChangeWindowState(state => demand.setWindowFocused(state.focused)),
		registerPortsView(service, demand, settings, labels, options),
		registerStatusBar(service, demand, settings, options),
		registerPortActions(service, settings, labels),
	);
}

export function deactivate() {}
