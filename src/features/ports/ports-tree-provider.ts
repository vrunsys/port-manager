import * as vscode from 'vscode';
import { buildPortTooltip, formatPortDescription, formatPortLabel } from './port-formatting';
import { describeProtection, SettingsSource } from './port-settings';
import { PortInfo } from './port-types';
import { PortsService } from './ports-service';
import { CONTEXT_VALUE } from './view-constants';

function contextValueFor(info: PortInfo, protection: string | undefined): string {
	if (info.pid === undefined) {
		return CONTEXT_VALUE.hiddenProcess;
	}
	return protection ? CONTEXT_VALUE.protectedPort : CONTEXT_VALUE.port;
}

export class PortItem extends vscode.TreeItem {
	constructor(readonly info: PortInfo, protection?: string) {
		super(formatPortLabel(info), vscode.TreeItemCollapsibleState.None);
		// A stable id keeps the selection on the same row when the list refreshes.
		this.id = `${info.protocol}:${info.port}:${info.pid ?? 'hidden'}`;
		this.description = formatPortDescription(info);
		this.tooltip = new vscode.MarkdownString(buildPortTooltip(info, protection));
		this.iconPath = new vscode.ThemeIcon('stop-circle');
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
	) {
		// Protected ports change which actions a row offers, so settings changes redraw the rows too.
		this.subscriptions = [
			service.onDidChange(() => this.changeEmitter.fire()),
			settings.onDidChange(() => this.changeEmitter.fire()),
		];
	}

	getTreeItem(item: PortItem): PortItem {
		return item;
	}

	getChildren(): PortItem[] {
		const current = this.settings.get();
		return this.service.state.ports.map(info => new PortItem(info, describeProtection(info, current)));
	}

	dispose(): void {
		this.subscriptions.forEach(subscription => subscription.dispose());
		this.changeEmitter.dispose();
	}
}
