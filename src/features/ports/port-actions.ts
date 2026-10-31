import { describeViewMessage, EMPTY_MESSAGE } from './port-formatting';
import { KillResult, PortInfo } from './port-types';
import { PortsState } from './ports-service';

/** Everything the actions need from the editor, so the logic can be tested without VS Code. */
export interface PortActionsUi {
	/** Resolves true only if the user picked the action button. */
	confirm(message: string, detail: string | undefined, actionLabel: string): Promise<boolean>;
	/** Resolves undefined if the user dismissed the picker. */
	pickPort(ports: readonly PortInfo[]): Promise<PortInfo | undefined>;
	showStatus(text: string): void;
	showWarning(text: string): void;
	showError(text: string): void;
	copy(text: string): Promise<void>;
	/** Resolves false if the link could not be opened. */
	openExternal(url: string): Promise<boolean>;
	withProgress<T>(title: string, task: () => Promise<T>): Promise<T>;
}

export interface PortKiller {
	killProcess(pid: number): Promise<KillResult>;
}

/** What the "kill by port" picker also needs: a current list of ports. */
export interface PortActionsService extends PortKiller {
	readonly state: PortsState;
	refresh(): Promise<void>;
}

export interface PortActions {
	kill(info: PortInfo): Promise<void>;
	killByPort(): Promise<void>;
	copyPort(info: PortInfo): Promise<void>;
	copyPid(info: PortInfo): Promise<void>;
	openInBrowser(info: PortInfo): Promise<void>;
}

const STOP_LABEL = 'Stop Process';
const ELEVATION_HINT = 'Try stopping it from a terminal with elevated privileges (sudo, or Run as administrator).';
const ONLY_HIDDEN_MESSAGE = 'Listening ports were found, but their processes are hidden, so none can be stopped from here.';

function hiddenProcessMessage(info: PortInfo): string {
	return `Port ${info.port} belongs to a process Port Manager cannot see, so it has no PID to use.`;
}

function describeProcess(info: PortInfo): string {
	return `${info.processName} (PID ${info.pid})`;
}

function reportKillResult(ui: PortActionsUi, info: PortInfo, result: KillResult): void {
	switch (result.status) {
		case 'killed':
			ui.showStatus(`Stopped ${describeProcess(info)}.`);
			break;
		case 'not-found':
			ui.showWarning(result.message);
			break;
		case 'permission-denied':
			ui.showError(`${result.message} ${ELEVATION_HINT}`);
			break;
		case 'failed':
			ui.showError(result.message);
			break;
	}
}

export function createPortActions(service: PortActionsService, ui: PortActionsUi): PortActions {
	/** Turns an unexpected exception into a readable message instead of a raw command failure. */
	const safely = async (action: () => Promise<void>): Promise<void> => {
		try {
			await action();
		} catch (error) {
			ui.showError(`Port Manager: ${error instanceof Error ? error.message : String(error)}`);
		}
	};

	const kill = (info: PortInfo): Promise<void> =>
		safely(async () => {
			if (info.pid === undefined) {
				ui.showWarning(hiddenProcessMessage(info));
				return;
			}
			const pid = info.pid;
			const detail = [`Listening on port ${info.port}.`, info.command && `Command: ${info.command}`]
				.filter(Boolean)
				.join('\n\n');
			if (!(await ui.confirm(`Stop ${describeProcess(info)}?`, detail, STOP_LABEL))) {
				return;
			}
			const result = await ui.withProgress(`Stopping ${describeProcess(info)}…`, () => service.killProcess(pid));
			reportKillResult(ui, info, result);
		});

	const killByPort = (): Promise<void> =>
		safely(async () => {
			// The view may be hidden, in which case nothing has been polling.
			await service.refresh();
			const { ports } = service.state;
			const killable = ports.filter(info => info.pid !== undefined);
			if (killable.length === 0) {
				ui.showWarning(ports.length > 0 ? ONLY_HIDDEN_MESSAGE : (describeViewMessage(service.state) ?? EMPTY_MESSAGE));
				return;
			}
			const chosen = await ui.pickPort(killable);
			if (chosen) {
				await kill(chosen);
			}
		});

	return {
		kill,
		killByPort,

		copyPort: info =>
			safely(async () => {
				await ui.copy(String(info.port));
				ui.showStatus(`Copied port ${info.port}`);
			}),

		copyPid: info =>
			safely(async () => {
				if (info.pid === undefined) {
					ui.showWarning(hiddenProcessMessage(info));
					return;
				}
				await ui.copy(String(info.pid));
				ui.showStatus(`Copied PID ${info.pid}`);
			}),

		openInBrowser: info =>
			safely(async () => {
				const url = `http://localhost:${info.port}`;
				if (!(await ui.openExternal(url))) {
					ui.showError(`Could not open ${url} in the browser.`);
				}
			}),
	};
}
