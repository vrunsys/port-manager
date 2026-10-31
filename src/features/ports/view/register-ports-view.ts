import * as vscode from 'vscode';
import { describeViewMessage } from './port-formatting';
import { PollingDemand } from '../service/polling-demand';
import { SettingsSource } from '../settings/port-settings';
import { PortsService } from '../service/ports-service';
import { PortsTreeProvider } from './ports-tree-provider';
import { REFRESH_COMMAND, VIEW_ID } from './view-constants';

/** Shows the service's ports in the sidebar and asks for polling while the view is visible. */
export function registerPortsView(
	service: PortsService,
	demand: PollingDemand,
	settings: Pick<SettingsSource, 'get' | 'onDidChange'>,
): vscode.Disposable {
	const provider = new PortsTreeProvider(service, settings);
	const treeView = vscode.window.createTreeView(VIEW_ID, { treeDataProvider: provider });

	const updateMessage = () => {
		treeView.message = describeViewMessage(service.state);
	};
	updateMessage();
	demand.set('view', treeView.visible);

	return vscode.Disposable.from(
		provider,
		treeView,
		service.onDidChange(updateMessage),
		treeView.onDidChangeVisibility(event => demand.set('view', event.visible)),
		vscode.commands.registerCommand(REFRESH_COMMAND, () => service.refresh()),
	);
}
