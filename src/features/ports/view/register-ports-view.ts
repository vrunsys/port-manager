import * as vscode from 'vscode';
import { errorMessage } from '../../../shared/error-message';
import { logger } from '../../../shared/logger';
import { PollingDemand } from '../service/polling-demand';
import { PortsService } from '../service/ports-service';
import { SettingsSource } from '../settings/port-settings';
import { describeListMessage } from './port-formatting';
import { describeHeader, scopePorts, SORT_MODES, sortName } from './port-list-model';
import { LabelStore } from './port-labels';
import { PortsTreeProvider } from './ports-tree-provider';
import { FILTER_ACTIVE_CONTEXT, REFRESH_COMMAND, RUNNING_ONLY_CONTEXT, VIEW_COMMAND, VIEW_ID } from './view-constants';
import { ViewOptions } from './view-options';

/** Only one search box at a time: asking again brings the open one back instead of stacking another. */
let activeFilterBox: vscode.InputBox | undefined;

/** A search box that narrows the list as you type. Enter keeps the search; Escape puts the old one back. */
function promptFilter(options: ViewOptions): void {
	if (activeFilterBox) {
		activeFilterBox.show();
		return;
	}
	const previous = options.query;
	let accepted = false;
	const box = vscode.window.createInputBox();
	activeFilterBox = box;
	box.title = 'Filter ports';
	box.placeholder = 'Search ports, processes, PIDs';
	box.value = previous;
	box.onDidChangeValue(value => options.setQuery(value));
	box.onDidAccept(() => {
		accepted = true;
		box.hide();
	});
	box.onDidHide(() => {
		if (!accepted) {
			options.setQuery(previous);
		}
		activeFilterBox = undefined;
		box.dispose();
	});
	box.show();
}

async function promptSort(options: ViewOptions): Promise<void> {
	const items = SORT_MODES.map(mode => ({
		label: sortName(mode),
		description: mode === options.sort ? 'current' : undefined,
		mode,
	}));
	const picked = await vscode.window.showQuickPick<(typeof items)[number]>(items, { title: 'Sort ports by', placeHolder: 'Sort ports by' });
	if (picked) {
		await options.setSort(picked.mode);
	}
}

/** Context keys switch which title-bar buttons show; a failure to set one is logged, never thrown. */
function setContext(key: string, value: unknown): void {
	void Promise.resolve(vscode.commands.executeCommand('setContext', key, value)).catch(error =>
		logger.warn(`Could not set the ${key} context: ${errorMessage(error)}`),
	);
}

/** Shows the service's ports in the sidebar and asks for polling while the view is visible. */
export function registerPortsView(
	service: PortsService,
	demand: PollingDemand,
	settings: Pick<SettingsSource, 'get' | 'onDidChange'>,
	labels: LabelStore,
	options: ViewOptions,
): vscode.Disposable {
	const provider = new PortsTreeProvider(service, settings, labels, options);
	const treeView = vscode.window.createTreeView(VIEW_ID, { treeDataProvider: provider });

	/** The text beside the view's title, the count on the sidebar icon, and the message above the rows. */
	const updateHeader = () => {
		const all = service.state.ports.length;
		const inScope = scopePorts(service.state.ports, options.runningOnly).length;
		const counts = { inScope, shown: provider.visiblePorts().length, hidden: all - inScope, query: options.query };
		treeView.description = all > 0 ? describeHeader(inScope, counts.shown, options.sort, counts.hidden) : undefined;
		treeView.badge = inScope > 0 ? { value: inScope, tooltip: `${inScope} listening ${inScope === 1 ? 'port' : 'ports'}` } : undefined;
		treeView.message = describeListMessage(service.state, counts);
		setContext(FILTER_ACTIVE_CONTEXT, options.query.trim() !== '');
		setContext(RUNNING_ONLY_CONTEXT, options.runningOnly);
	};
	updateHeader();
	demand.set('view', treeView.visible);

	return vscode.Disposable.from(
		provider,
		treeView,
		service.onDidChange(updateHeader),
		labels.onDidChange(updateHeader),
		options.onDidChange(updateHeader),
		treeView.onDidChangeVisibility(event => demand.set('view', event.visible)),
		vscode.commands.registerCommand(REFRESH_COMMAND, () => service.refresh()),
		vscode.commands.registerCommand(VIEW_COMMAND.filter, () => promptFilter(options)),
		vscode.commands.registerCommand(VIEW_COMMAND.clearFilter, () => options.setQuery('')),
		vscode.commands.registerCommand(VIEW_COMMAND.sort, () => promptSort(options)),
		vscode.commands.registerCommand(VIEW_COMMAND.showRunningOnly, () => options.setRunningOnly(true)),
		vscode.commands.registerCommand(VIEW_COMMAND.showAllPorts, () => options.setRunningOnly(false)),
	);
}
