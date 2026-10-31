import * as vscode from 'vscode';
import { whyNotKillable } from '../kill/kill-policy';
import { PortInfo } from '../port-types';
import { PortsService } from '../service/ports-service';
import { SettingsSource } from '../settings/port-settings';
import { buildPortTooltip } from './port-formatting';
import { filterPorts, rowLabel, rowMeta, scopePorts, sortPorts } from './port-list-model';
import { LabelStore } from './port-labels';
import { CONTEXT_VALUE } from './view-constants';
import { ViewOptions } from './view-options';

function contextValueFor(info: PortInfo, protection: string | undefined): string {
	if (info.pid === undefined) {
		return CONTEXT_VALUE.hiddenProcess;
	}
	return protection ? CONTEXT_VALUE.protectedPort : CONTEXT_VALUE.port;
}

export class PortItem extends vscode.TreeItem {
	constructor(readonly info: PortInfo, protection: string | undefined, label: string | undefined) {
		super(rowLabel(info, label), vscode.TreeItemCollapsibleState.None);
		// A stable id keeps the selection on the same row when the list refreshes.
		this.id = `${info.protocol}:${info.port}:${info.pid ?? 'hidden'}`;
		this.description = rowMeta(info, label);
		this.tooltip = new vscode.MarkdownString(buildPortTooltip(info, protection, label));
		// Blue like a port badge; greyed when the process cannot be stopped from here.
		const stoppable = protection === undefined && info.pid !== undefined;
		this.iconPath = new vscode.ThemeIcon(
			'stop-circle',
			new vscode.ThemeColor(stoppable ? 'textLink.foreground' : 'disabledForeground'),
		);
		this.contextValue = contextValueFor(info, protection);
	}
}

export class PortsTreeProvider implements vscode.TreeDataProvider<PortItem>, vscode.Disposable {
	private readonly changeEmitter = new vscode.EventEmitter<void>();
	readonly onDidChangeTreeData = this.changeEmitter.event;
	private readonly subscriptions: Array<{ dispose(): void }>;

	constructor(
		private readonly service: PortsService,
		private readonly settings: Pick<SettingsSource, 'get' | 'onDidChange'>,
		private readonly labels: LabelStore,
		private readonly options: ViewOptions,
	) {
		// Settings change which actions a row offers; names and the search change which rows show and in what order.
		const redraw = () => this.changeEmitter.fire();
		this.subscriptions = [
			service.onDidChange(redraw),
			settings.onDidChange(redraw),
			labels.onDidChange(redraw),
			options.onDidChange(redraw),
		];
	}

	/** The ports in scope (all, or running only) that pass the current search, in the current order. */
	visiblePorts(): PortInfo[] {
		const inScope = scopePorts(this.service.state.ports, this.options.runningOnly);
		const matching = filterPorts(inScope, this.options.query, this.labels);
		return sortPorts(matching, this.options.sort, this.labels);
	}

	getTreeItem(item: PortItem): PortItem {
		return item;
	}

	getChildren(): PortItem[] {
		const current = this.settings.get();
		return this.visiblePorts().map(
			info => new PortItem(info, whyNotKillable(info, current), this.labels.get(info.port)),
		);
	}

	dispose(): void {
		this.subscriptions.forEach(subscription => subscription.dispose());
		this.changeEmitter.dispose();
	}
}
