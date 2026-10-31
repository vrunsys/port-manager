/** Must match the ids contributed in package.json. */
export const VIEW_ID = 'port-manager.ports';
export const REFRESH_COMMAND = 'port-manager.refresh';

export const ITEM_COMMAND = {
	kill: 'port-manager.kill',
	killByPort: 'port-manager.killByPort',
	copyPort: 'port-manager.copyPort',
	copyPid: 'port-manager.copyPid',
	openInBrowser: 'port-manager.openInBrowser',
} as const;

/** Menus use these to hide actions that need a PID on rows whose process is hidden. */
export const CONTEXT_VALUE = {
	port: 'port',
	hiddenProcess: 'port-hidden',
} as const;
