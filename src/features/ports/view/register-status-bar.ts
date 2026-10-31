import * as vscode from 'vscode';
import { describeStatusBar } from './port-formatting';
import { PollingDemand } from '../service/polling-demand';
import { SettingsSource } from '../settings/port-settings';
import { PortsService } from '../service/ports-service';
import { FOCUS_VIEW_COMMAND } from './view-constants';
import { ViewOptions } from './view-options';

const STATUS_BAR_ID = 'port-manager.status';
const STATUS_BAR_PRIORITY = 100;
const WARNING_BACKGROUND = new vscode.ThemeColor('statusBarItem.warningBackground');

/** Shows "$(plug) N" in the status bar; clicking it focuses the Port Manager view. */
export function registerStatusBar(
	service: PortsService,
	demand: PollingDemand,
	settings: Pick<SettingsSource, 'get' | 'onDidChange'>,
	options: ViewOptions,
): vscode.Disposable {
	const item = vscode.window.createStatusBarItem(STATUS_BAR_ID, vscode.StatusBarAlignment.Left, STATUS_BAR_PRIORITY);
	item.name = 'Port Manager';
	item.command = FOCUS_VIEW_COMMAND;

	const render = () => {
		const view = describeStatusBar(service.state, options.runningOnly);
		item.text = view.text;
		item.tooltip = view.tooltip;
		item.backgroundColor = view.warning ? WARNING_BACKGROUND : undefined;
	};

	const applySetting = () => {
		const show = settings.get().showStatusBar;
		if (show) {
			render();
			item.show();
		} else {
			item.hide();
		}
		// Without the item on screen there is no reason to keep scanning for it.
		demand.set('status-bar', show);
	};
	applySetting();

	// "Running only" changes which rows the list shows, and the count must keep matching it.
	return vscode.Disposable.from(item, service.onDidChange(render), options.onDidChange(render), settings.onDidChange(applySetting));
}
