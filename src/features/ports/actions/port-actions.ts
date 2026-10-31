import { errorMessage } from '../../../shared/error-message';
import { describeViewMessage, EMPTY_MESSAGE } from '../view/port-formatting';
import { GuardEnvironment } from '../kill/kill-guards';
import { isOwnedByAnotherUser, whyNotKillable } from '../kill/kill-policy';
import { DEFAULT_SETTINGS, SettingsSource } from '../settings/port-settings';
import { KillResult, PortInfo } from '../port-types';
import { PortsState } from '../service/ports-service';
import { LabelWriter, normalizeLabel } from '../view/port-labels';
import { describeProcess, hiddenProcessMessage, protectedMessage, reportKillResult } from './kill-messages';

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

/** What the actions need from the service: a current list of ports, and a verified way to stop one of them. */
export interface PortActionsService {
	killPort(info: PortInfo): Promise<KillResult>;
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

interface ActionEnvironment extends GuardEnvironment {
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
			ui.showError(`Port Manager: ${errorMessage(error)}`);
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
			const result = await ui.withProgress(`Stopping ${describeProcess(info)}…`, () => service.killPort(info));
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
