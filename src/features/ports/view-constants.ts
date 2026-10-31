/** Must match the ids contributed in package.json. */
export const VIEW_ID = 'port-manager.ports';
export const REFRESH_COMMAND = 'port-manager.refresh';
/** VS Code creates "<view id>.focus" for every contributed view. */
export const FOCUS_VIEW_COMMAND = `${VIEW_ID}.focus`;

export const ITEM_COMMAND = {
	kill: 'port-manager.kill',
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
