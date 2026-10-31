import { describeViewMessage, EMPTY_MESSAGE } from '../view/port-formatting';
import { GuardEnvironment } from '../kill/kill-guards';
import { isOwnedByAnotherUser, whyNotKillable } from '../kill/kill-policy';
import { DEFAULT_SETTINGS, SettingsSource } from '../settings/port-settings';
import { KillResult, PortInfo } from '../port-types';
import { PortsState } from '../service/ports-service';
import { LabelWriter, normalizeLabel } from '../view/port-labels';

/** Everything the actions need from the editor, so the logic can be tested without VS Code. */
export interface PortActionsUi {
	/** Resolves true only if the user picked the action button. */
	confirm(message: string, detail: string | undefined, actionLabel: string): Promise<boolean>;
	/** The name typed for a port: undefined if cancelled, an empty string to remove the name. */
	promptLabel(port: number, current: string | undefined): Promise<string | undefined>;
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
	rename(info: PortInfo): Promise<void>;
	copyPort(info: PortInfo): Promise<void>;
	copyPid(info: PortInfo): Promise<void>;
	openInBrowser(info: PortInfo): Promise<void>;
}

const STOP_LABEL = 'Stop Process';
const STOP_ANYWAY_LABEL = 'Stop Anyway';
const NONE_STOPPABLE_MESSAGE =
	'Listening ports were found, but none can be stopped from here: their processes are hidden or protected.';

function hiddenProcessMessage(info: PortInfo): string {
	return `Port ${info.port} belongs to a process Port Manager cannot see, so it has no PID to use.`;
}

function describeProcess(info: PortInfo): string {
	return `${info.processName} (PID ${info.pid})`;
}

/** Tells the user how to get the rights themselves; Port Manager never elevates on its own. */
export function elevationHint(pid: number, platform: NodeJS.Platform): string {
	const never = 'Port Manager never raises its own privileges.';
	return platform === 'win32'
		? `This needs administrator rights. ${never} Restart VS Code with "Run as administrator", or run "taskkill /PID ${pid} /T /F" in an elevated terminal.`
		: `This needs elevated rights (sudo). ${never} Run "sudo kill ${pid}" in a terminal (add -9 if it ignores that).`;
}

function reportKillResult(ui: PortActionsUi, info: PortInfo, result: KillResult, platform: NodeJS.Platform): void {
	switch (result.status) {
		case 'killed':
			ui.showStatus(`Stopped ${describeProcess(info)}.`);
			break;
		case 'not-found':
			ui.showWarning(result.message);
			break;
		case 'permission-denied':
			ui.showError(`${result.message} ${elevationHint(info.pid ?? 0, platform)}`);
			break;
		case 'failed':
			ui.showError(result.message);
			break;
	}
}

function protectedMessage(info: PortInfo, reason: string): string {
	return `Port ${info.port} is protected (${reason}), so Port Manager will not stop it.`;
}

export interface ActionEnvironment extends GuardEnvironment {
	/** The OS user running VS Code; without it no "another user" warning can be given. */
	currentUser?: string;
}

/** `settings` is read at the moment of each action, so changes apply immediately. */
export function createPortActions(
	service: PortActionsService,
	ui: PortActionsUi,
	settings: Pick<SettingsSource, 'get'> = { get: () => DEFAULT_SETTINGS },
	environment: ActionEnvironment = {},
	labels: LabelWriter = { get: () => undefined, set: async () => {} },
): PortActions {
	const platform = environment.platform ?? process.platform;
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
			const current = settings.get();
			const blocked = whyNotKillable(info, current, environment);
			if (blocked) {
				ui.showWarning(protectedMessage(info, blocked));
				return;
			}
			if (info.pid === undefined) {
				ui.showWarning(hiddenProcessMessage(info));
				return;
			}
			const pid = info.pid;
			const name = labels.get(info.port);
			// Another user's process is always confirmed, even when confirmations are switched off.
			const foreign = isOwnedByAnotherUser(info, environment.currentUser);
			const detail = [
				foreign &&
					`Warning: this process belongs to another user (${info.user}), not to you (${environment.currentUser}). Stopping it may disrupt that user or the system, and it will probably need elevated rights.`,
				`Listening on port ${info.port}${name ? `, named “${name}”` : ''}.`,
				info.command && `Command: ${info.command}`,
			]
				.filter(Boolean)
				.join('\n\n');
			if (current.confirmBeforeKill || foreign) {
				const title = foreign
					? `Stop ${describeProcess(info)} owned by ${info.user}?`
					: `Stop ${describeProcess(info)}?`;
				if (!(await ui.confirm(title, detail, foreign ? STOP_ANYWAY_LABEL : STOP_LABEL))) {
					return;
				}
			}
			const result = await ui.withProgress(`Stopping ${describeProcess(info)}…`, () => service.killProcess(pid));
			reportKillResult(ui, info, result, platform);
		});

	const killByPort = (): Promise<void> =>
		safely(async () => {
			// The view may be hidden, in which case nothing has been polling.
			await service.refresh();
			const { ports } = service.state;
			const current = settings.get();
			const killable = ports.filter(
				info => info.pid !== undefined && !whyNotKillable(info, current, environment),
			);
			if (killable.length === 0) {
				ui.showWarning(ports.length > 0 ? NONE_STOPPABLE_MESSAGE : (describeViewMessage(service.state) ?? EMPTY_MESSAGE));
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

		rename: info =>
			safely(async () => {
				const entered = await ui.promptLabel(info.port, labels.get(info.port));
				if (entered === undefined) {
					return;
				}
				const name = normalizeLabel(entered);
				await labels.set(info.port, name);
				ui.showStatus(name ? `Named port ${info.port} “${name}”` : `Removed the name of port ${info.port}`);
			}),

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
