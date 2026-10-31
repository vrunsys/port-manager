import * as vscode from 'vscode';
import { describeStatusBar } from './port-formatting';
import { PollingDemand } from './polling-demand';
import { PortsService } from './ports-service';
import { FOCUS_VIEW_COMMAND, SETTINGS_SECTION, SHOW_STATUS_BAR_SETTING } from './view-constants';

const STATUS_BAR_ID = 'port-manager.status';
const STATUS_BAR_PRIORITY = 100;
const WARNING_BACKGROUND = new vscode.ThemeColor('statusBarItem.warningBackground');

const isEnabled = (): boolean =>
	vscode.workspace.getConfiguration(SETTINGS_SECTION).get<boolean>(SHOW_STATUS_BAR_SETTING, true);

/** Shows "$(plug) N" in the status bar; clicking it focuses the Port Manager view. */
export function registerStatusBar(service: PortsService, demand: PollingDemand): vscode.Disposable {
	const item = vscode.window.createStatusBarItem(STATUS_BAR_ID, vscode.StatusBarAlignment.Left, STATUS_BAR_PRIORITY);
	item.name = 'Port Manager';
	item.command = FOCUS_VIEW_COMMAND;

	const render = () => {
		const view = describeStatusBar(service.state);
		item.text = view.text;
		item.tooltip = view.tooltip;
		item.backgroundColor = view.warning ? WARNING_BACKGROUND : undefined;
	};

	const applySetting = () => {
		const show = isEnabled();
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

	return vscode.Disposable.from(
		item,
		service.onDidChange(render),
		vscode.workspace.onDidChangeConfiguration(event => {
			if (event.affectsConfiguration(`${SETTINGS_SECTION}.${SHOW_STATUS_BAR_SETTING}`)) {
				applySetting();
			}
		}),
	);
}
