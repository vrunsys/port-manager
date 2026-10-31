import * as os from 'os';
import * as vscode from 'vscode';
import { createPortActions, PortActions, PortActionsService, PortActionsUi } from './port-actions';
import { formatPortDescription, formatPortLabel } from '../view/port-formatting';
import { LabelStore, validateLabel } from '../view/port-labels';
import { SettingsSource } from '../settings/port-settings';
import { PortInfo } from '../port-types';
import { PortItem } from '../view/ports-tree-provider';
import { ITEM_COMMAND } from '../view/view-constants';

const STATUS_MESSAGE_MS = 3000;

/** `labels` lets the pickers show and match the names you gave ports. */
const createVscodeUi = (labels: LabelStore): PortActionsUi => ({
	async confirm(message, detail, actionLabel) {
		const choice = await vscode.window.showWarningMessage(message, { modal: true, detail }, actionLabel);
		return choice === actionLabel;
	},
	promptLabel: (port, current) =>
		Promise.resolve(
			vscode.window.showInputBox({
				title: `Name for port ${port}`,
				prompt: 'Shown instead of the process name. Leave empty to remove the name.',
				value: current ?? '',
				validateInput: validateLabel,
			}),
		),
	async pickPort(ports) {
		const items = ports.map(info => ({
			label: formatPortLabel(info),
			description: [labels.get(info.port), formatPortDescription(info)].filter(Boolean).join(' · '),
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
});

/** Menus pass the clicked row; anything else (a keybinding, or another extension calling the command) does nothing. */
function onRow(action: (info: PortInfo) => Promise<void>) {
	return (item?: unknown) => (item instanceof PortItem ? action(item.info) : undefined);
}

/** os.userInfo() throws when the account has no passwd entry (some containers); then no ownership warning is possible. */
function currentUserName(): string | undefined {
	try {
		return os.userInfo().username;
	} catch {
		return undefined;
	}
}

export function registerPortActions(
	service: PortActionsService,
	settings: Pick<SettingsSource, 'get'>,
	labels: LabelStore,
): vscode.Disposable {
	const actions: PortActions = createPortActions(
		service,
		createVscodeUi(labels),
		settings,
		{ currentUser: currentUserName() },
		labels,
	);
	return vscode.Disposable.from(
		vscode.commands.registerCommand(ITEM_COMMAND.killByPort, () => actions.killByPort()),
		vscode.commands.registerCommand(ITEM_COMMAND.kill, onRow(actions.kill)),
		vscode.commands.registerCommand(ITEM_COMMAND.rename, onRow(actions.rename)),
		vscode.commands.registerCommand(ITEM_COMMAND.copyPort, onRow(actions.copyPort)),
		vscode.commands.registerCommand(ITEM_COMMAND.copyPid, onRow(actions.copyPid)),
		vscode.commands.registerCommand(ITEM_COMMAND.openInBrowser, onRow(actions.openInBrowser)),
	);
}
