import * as vscode from 'vscode';
import { describeViewMessage } from './port-formatting';
import { PortsService } from './ports-service';
import { PortsTreeProvider } from './ports-tree-provider';
import { REFRESH_COMMAND, VIEW_ID } from './view-constants';

/** Shows the service's ports in the sidebar and keeps polling only while the view is visible. */
export function registerPortsView(service: PortsService): vscode.Disposable {
	const provider = new PortsTreeProvider(service);
	const treeView = vscode.window.createTreeView(VIEW_ID, { treeDataProvider: provider });

	const updateMessage = () => {
		treeView.message = describeViewMessage(service.state);
	};
	updateMessage();
	service.setPollingEnabled(treeView.visible);

	return vscode.Disposable.from(
		provider,
		treeView,
		service.onDidChange(updateMessage),
		treeView.onDidChangeVisibility(event => service.setPollingEnabled(event.visible)),
		vscode.commands.registerCommand(REFRESH_COMMAND, () => service.refresh()),
	);
}
