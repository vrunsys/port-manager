import * as vscode from 'vscode';
import { buildPortTooltip, formatPortDescription, formatPortLabel } from './port-formatting';
import { PortInfo } from './port-types';
import { PortsService } from './ports-service';

export class PortItem extends vscode.TreeItem {
	constructor(readonly info: PortInfo) {
		super(formatPortLabel(info), vscode.TreeItemCollapsibleState.None);
		// A stable id keeps the selection on the same row when the list refreshes.
		this.id = `${info.protocol}:${info.port}:${info.pid ?? 'hidden'}`;
		this.description = formatPortDescription(info);
		this.tooltip = new vscode.MarkdownString(buildPortTooltip(info));
		this.iconPath = new vscode.ThemeIcon('stop-circle');
	}
}

export class PortsTreeProvider implements vscode.TreeDataProvider<PortItem>, vscode.Disposable {
	private readonly changeEmitter = new vscode.EventEmitter<void>();
	readonly onDidChangeTreeData = this.changeEmitter.event;
	private readonly subscription: { dispose(): void };

	constructor(private readonly service: PortsService) {
		this.subscription = service.onDidChange(() => this.changeEmitter.fire());
	}

	getTreeItem(item: PortItem): PortItem {
		return item;
	}

	getChildren(): PortItem[] {
		return this.service.state.ports.map(info => new PortItem(info));
	}

	dispose(): void {
		this.subscription.dispose();
		this.changeEmitter.dispose();
	}
}
