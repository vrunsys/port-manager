/**
 * A stand-in for the `vscode` module, used by every test that loads code which imports it
 * (vitest.config.mjs points the "vscode" import here). It does nothing useful by itself: it records what
 * the extension asks for, lets a test act as the user, and remembers what has not been disposed.
 */
type Handler = (...args: unknown[]) => unknown;

const open = new Map<number, string>();
let nextRegistration = 1;

/** Notes that something was registered; disposing the returned object notes that it was released. */
function track(kind: string): Disposable {
	const id = nextRegistration++;
	open.set(id, kind);
	return new Disposable(() => void open.delete(id));
}

export class Disposable {
	constructor(private readonly onDispose: () => void) {}

	dispose(): void {
		this.onDispose();
	}

	static from(...items: Array<{ dispose(): unknown }>): Disposable {
		return new Disposable(() => items.forEach(item => item.dispose()));
	}
}

export class EventEmitter<T = void> {
	private readonly listeners = new Set<(value: T) => void>();
	private readonly registration = track('event emitter');

	readonly event = (listener: (value: T) => void): Disposable => {
		this.listeners.add(listener);
		return new Disposable(() => void this.listeners.delete(listener));
	};

	fire(value: T): void {
		[...this.listeners].forEach(listener => listener(value));
	}

	dispose(): void {
		this.listeners.clear();
		this.registration.dispose();
	}
}

export enum TreeItemCollapsibleState {
	None = 0,
	Collapsed = 1,
	Expanded = 2,
}

export class TreeItem {
	id?: string;
	description?: string;
	tooltip?: unknown;
	iconPath?: unknown;
	contextValue?: string;

	constructor(
		public label: string,
		public collapsibleState?: TreeItemCollapsibleState,
	) {}
}

export class ThemeColor {
	constructor(readonly id: string) {}
}

export class ThemeIcon {
	constructor(
		readonly id: string,
		readonly color?: ThemeColor,
	) {}
}

export class MarkdownString {
	constructor(readonly value: string) {}
}

export const Uri = { parse: (value: string) => ({ value, toString: () => value }) };
export enum StatusBarAlignment {
	Left = 1,
	Right = 2,
}
export enum ProgressLocation {
	Notification = 15,
}

export interface FakeInputBox {
	title?: string;
	placeholder?: string;
	value: string;
	shown: number;
	disposed: boolean;
	/** The user types: updates the value and tells the listener. */
	type(text: string): void;
	/** The user presses Enter. */
	accept(): void;
	/** The user presses Escape. */
	escape(): void;
}

export interface FakeStatusBarItem {
	id: string;
	name?: string;
	command?: string;
	text: string;
	tooltip?: string;
	backgroundColor?: ThemeColor;
	visible: boolean;
}

export interface FakeTreeView {
	id: string;
	provider: { getChildren(): unknown[]; onDidChangeTreeData: (listener: () => void) => Disposable };
	visible: boolean;
	description?: string;
	badge?: { value: number; tooltip: string };
	message?: string;
	disposed: boolean;
	/** The user shows or hides the view. */
	setVisible(visible: boolean): void;
}

export interface FakeOutputChannel {
	name: string;
	options: unknown;
	lines: Array<[level: string, message: string]>;
}

const registered = new Map<string, Handler>();
const windowStateListeners = new Set<(state: { focused: boolean }) => void>();
const configurationListeners = new Set<(event: { affectsConfiguration(section: string): boolean }) => void>();

/** What the test can see and do. Call `fake.reset()` before each test. */
export const fake = {
	focused: true,
	configuration: {} as Record<string, unknown>,
	executed: [] as unknown[][],
	warnings: [] as string[],
	errors: [] as string[],
	statusMessages: [] as string[],
	clipboard: [] as string[],
	opened: [] as string[],
	inputBoxes: [] as FakeInputBox[],
	statusBarItems: [] as FakeStatusBarItem[],
	treeViews: [] as FakeTreeView[],
	outputChannels: [] as FakeOutputChannel[],
	/** The options of every showInputBox call, so a test can see whether a prompt was opened. */
	prompts: [] as unknown[],
	/** Answers the next showInputBox (undefined = the user pressed Escape). */
	nextInputBoxAnswer: undefined as string | undefined,
	/** Chooses an item for the next showQuickPick. */
	nextQuickPick: undefined as undefined | ((items: readonly unknown[]) => unknown),
	/** The button the user clicks on the next modal warning (undefined = closes it). */
	nextModalButton: undefined as undefined | ((message: string, buttons: string[]) => string | undefined),
	quickPicks: [] as Array<readonly unknown[]>,
	modals: [] as Array<{ message: string; detail?: string; buttons: string[] }>,

	reset(): void {
		open.clear();
		registered.clear();
		windowStateListeners.clear();
		configurationListeners.clear();
		Object.assign(fake, {
			focused: true,
			configuration: {},
			executed: [],
			warnings: [],
			errors: [],
			statusMessages: [],
			clipboard: [],
			opened: [],
			inputBoxes: [],
			statusBarItems: [],
			treeViews: [],
			outputChannels: [],
			prompts: [],
			nextInputBoxAnswer: undefined,
			nextQuickPick: undefined,
			nextModalButton: undefined,
			quickPicks: [],
			modals: [],
		});
		window.state.focused = true;
	},

	/** What has been registered and not yet disposed: empty means everything was cleaned up. */
	live(): string[] {
		return [...open.values()];
	},

	/** The ids of the commands that are registered right now. */
	commandIds(): string[] {
		return [...registered.keys()].sort();
	},

	/** The user runs a command (from a menu, a button or the palette). */
	invoke(id: string, ...args: unknown[]): unknown {
		const handler = registered.get(id);
		if (!handler) {
			throw new Error(`Command ${id} is not registered`);
		}
		return handler(...args);
	},

	setWindowFocused(focused: boolean): void {
		window.state.focused = focused;
		[...windowStateListeners].forEach(listener => listener({ focused }));
	},

	/** The user edits settings: values are set and the change event fires for them. */
	changeConfiguration(values: Record<string, unknown>): void {
		Object.assign(fake.configuration, values);
		const keys = Object.keys(values);
		[...configurationListeners].forEach(listener =>
			listener({ affectsConfiguration: section => keys.some(key => key === section || key.startsWith(`${section}.`)) }),
		);
	},

	/** The setContext values set so far, last one wins. */
	contexts(): Record<string, unknown> {
		const result: Record<string, unknown> = {};
		for (const [command, key, value] of fake.executed) {
			if (command === 'setContext') {
				result[key as string] = value;
			}
		}
		return result;
	},
};

function createInputBox(): FakeInputBox & Record<string, unknown> {
	const handlers: { change?: (value: string) => void; accept?: () => void; hide?: () => void } = {};
	const registration = track('input box');
	const box: FakeInputBox & Record<string, unknown> = {
		value: '',
		shown: 0,
		disposed: false,
		type(text: string) {
			box.value = text;
			handlers.change?.(text);
		},
		accept() {
			handlers.accept?.();
		},
		escape() {
			handlers.hide?.();
		},
		onDidChangeValue(listener: (value: string) => void) {
			handlers.change = listener;
			return new Disposable(() => {});
		},
		onDidAccept(listener: () => void) {
			handlers.accept = listener;
			return new Disposable(() => {});
		},
		onDidHide(listener: () => void) {
			handlers.hide = listener;
			return new Disposable(() => {});
		},
		show() {
			(box.shown as number)++;
		},
		hide() {
			handlers.hide?.();
		},
		dispose() {
			box.disposed = true;
			registration.dispose();
		},
	};
	fake.inputBoxes.push(box);
	return box;
}

export const window = {
	state: { focused: true },
	onDidChangeWindowState(listener: (state: { focused: boolean }) => void): Disposable {
		windowStateListeners.add(listener);
		const registration = track('window state listener');
		return new Disposable(() => {
			windowStateListeners.delete(listener);
			registration.dispose();
		});
	},
	createOutputChannel(name: string, options?: unknown) {
		const channel: FakeOutputChannel = { name, options, lines: [] };
		fake.outputChannels.push(channel);
		const registration = track('output channel');
		const write = (level: string) => (message: string) => void channel.lines.push([level, message]);
		return { info: write('info'), warn: write('warn'), error: write('error'), dispose: () => registration.dispose() };
	},
	createTreeView(id: string, options: { treeDataProvider: FakeTreeView['provider'] }) {
		const visibility = new EventEmitter<{ visible: boolean }>();
		const registration = track('tree view');
		const view: FakeTreeView & Record<string, unknown> = {
			id,
			provider: options.treeDataProvider,
			visible: true,
			disposed: false,
			setVisible(visible: boolean) {
				view.visible = visible;
				visibility.fire({ visible });
			},
			onDidChangeVisibility: visibility.event,
			dispose() {
				view.disposed = true;
				visibility.dispose();
				registration.dispose();
			},
		};
		fake.treeViews.push(view);
		return view;
	},
	createStatusBarItem(id: string, _alignment?: StatusBarAlignment, _priority?: number) {
		const registration = track('status bar item');
		const item: FakeStatusBarItem & Record<string, unknown> = {
			id,
			text: '',
			visible: false,
			show() {
				item.visible = true;
			},
			hide() {
				item.visible = false;
			},
			dispose() {
				registration.dispose();
			},
		};
		fake.statusBarItems.push(item);
		return item;
	},
	createInputBox,
	showInputBox: async (options?: unknown) => {
		fake.prompts.push(options);
		return fake.nextInputBoxAnswer;
	},
	showQuickPick: async (items: readonly unknown[]) => {
		fake.quickPicks.push(items);
		return fake.nextQuickPick?.(items);
	},
	showWarningMessage: async (message: string, optionsOrButton?: unknown, ...buttons: string[]) => {
		const modal = typeof optionsOrButton === 'object' && optionsOrButton !== null;
		if (modal) {
			const detail = (optionsOrButton as { detail?: string }).detail;
			fake.modals.push({ message, detail, buttons });
			return fake.nextModalButton?.(message, buttons);
		}
		fake.warnings.push(message);
		return undefined;
	},
	showErrorMessage: async (message: string) => void fake.errors.push(message),
	setStatusBarMessage: (message: string) => void fake.statusMessages.push(message),
	withProgress: async <T>(_options: unknown, task: () => Promise<T>) => task(),
};

export const workspace = {
	getConfiguration(section: string) {
		return { get: (key: string) => fake.configuration[`${section}.${key}`] };
	},
	onDidChangeConfiguration(listener: (event: { affectsConfiguration(section: string): boolean }) => void): Disposable {
		configurationListeners.add(listener);
		const registration = track('configuration listener');
		return new Disposable(() => {
			configurationListeners.delete(listener);
			registration.dispose();
		});
	},
};

export const commands = {
	registerCommand(id: string, handler: Handler): Disposable {
		registered.set(id, handler);
		const registration = track(`command ${id}`);
		return new Disposable(() => {
			registered.delete(id);
			registration.dispose();
		});
	},
	executeCommand: async (...args: unknown[]) => void fake.executed.push(args),
};

export const env = {
	clipboard: { writeText: async (text: string) => void fake.clipboard.push(text) },
	asExternalUri: async (uri: unknown) => uri,
	openExternal: async (uri: { toString(): string }) => {
		fake.opened.push(uri.toString());
		return true;
	},
};
