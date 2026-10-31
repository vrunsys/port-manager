import * as os from 'os';
import * as vscode from 'vscode';
import { createPortActions, PortActions, PortActionsService, PortActionsUi } from './port-actions';
import { formatPortDescription, formatPortLabel } from './port-formatting';
import { SettingsSource } from './port-settings';
import { PortInfo } from './port-types';
import { PortItem } from './ports-tree-provider';
import { ITEM_COMMAND } from './view-constants';

const STATUS_MESSAGE_MS = 3000;

const vscodeUi: PortActionsUi = {
	async confirm(message, detail, actionLabel) {
		const choice = await vscode.window.showWarningMessage(message, { modal: true, detail }, actionLabel);
		return choice === actionLabel;
	},
	async pickPort(ports) {
		const items = ports.map(info => ({
			label: formatPortLabel(info),
			description: formatPortDescription(info),
			detail: info.command,
			info,
		}));
		const picked = await vscode.window.showQuickPick(items, {
			title: 'Kill Process on Port',
			placeHolder: 'Type a port number or process name',
			// Without these only the label (the port number) would be searched.
			matchOnDescription: true,
			matchOnDetail: true,
		});
		return picked?.info;
	},
	showStatus: text => void vscode.window.setStatusBarMessage(text, STATUS_MESSAGE_MS),
	showWarning: text => void vscode.window.showWarningMessage(text),
	showError: text => void vscode.window.showErrorMessage(text),
	copy: text => Promise.resolve(vscode.env.clipboard.writeText(text)),
	// asExternalUri makes localhost links work when the ports live on a remote host.
	openExternal: async url => vscode.env.openExternal(await vscode.env.asExternalUri(vscode.Uri.parse(url))),
	withProgress: (title, task) =>
		Promise.resolve(vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title }, task)),
};

/** Menus pass the clicked row; a call without one (e.g. from a keybinding) does nothing. */
function onRow(action: (info: PortInfo) => Promise<void>) {
	return (item?: PortItem) => (item ? action(item.info) : undefined);
}

/** os.userInfo() throws when the account has no passwd entry (some containers); then no ownership warning is possible. */
function currentUserName(): string | undefined {
	try {
		return os.userInfo().username;
	} catch {
		return undefined;
	}
}

export function registerPortActions(service: PortActionsService, settings: Pick<SettingsSource, 'get'>): vscode.Disposable {
	const actions: PortActions = createPortActions(service, vscodeUi, settings, { currentUser: currentUserName() });
	return vscode.Disposable.from(
		vscode.commands.registerCommand(ITEM_COMMAND.killByPort, () => actions.killByPort()),
		vscode.commands.registerCommand(ITEM_COMMAND.kill, onRow(actions.kill)),
		vscode.commands.registerCommand(ITEM_COMMAND.copyPort, onRow(actions.copyPort)),
		vscode.commands.registerCommand(ITEM_COMMAND.copyPid, onRow(actions.copyPid)),
		vscode.commands.registerCommand(ITEM_COMMAND.openInBrowser, onRow(actions.openInBrowser)),
	);
}
