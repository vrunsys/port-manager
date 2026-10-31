/** Must match the ids contributed in package.json. */
export const VIEW_ID = 'port-manager.ports';
export const REFRESH_COMMAND = 'port-manager.refresh';
/** VS Code creates "<view id>.focus" for every contributed view. */
export const FOCUS_VIEW_COMMAND = `${VIEW_ID}.focus`;

/** Commands in the view's title bar: search, sort, and clearing the search. */
export const VIEW_COMMAND = {
	filter: 'port-manager.filter',
	clearFilter: 'port-manager.clearFilter',
	showRunningOnly: 'port-manager.showRunningOnly',
	showAllPorts: 'port-manager.showAllPorts',
	sort: 'port-manager.sort',
} as const;

/** Lets the title bar show "clear" only while a search is active. */
export const FILTER_ACTIVE_CONTEXT = 'portManager.filterActive';

/** Lets the title bar offer "show all" while "running only" is on, and the reverse. */
export const RUNNING_ONLY_CONTEXT = 'portManager.runningOnly';

export const ITEM_COMMAND = {
	kill: 'port-manager.kill',
	rename: 'port-manager.rename',
	killByPort: 'port-manager.killByPort',
	copyPort: 'port-manager.copyPort',
	copyPid: 'port-manager.copyPid',
	openInBrowser: 'port-manager.openInBrowser',
} as const;

/** Menus use these to hide Kill on protected rows and PID actions on rows whose process is hidden. */
export const CONTEXT_VALUE = {
	port: 'port',
	hiddenProcess: 'port-hidden',
	protectedPort: 'port-protected',
} as const;
