import { PortInfo, PortsErrorKind } from '../port-types';
import { PortsState } from '../service/ports-service';
import { scopePorts } from './port-list-model';

const SEPARATOR = ' · ';

const ERROR_HEADLINE: Record<PortsErrorKind, string> = {
	'tool-missing': 'Tool missing.',
	'permission-denied': 'Permission denied.',
	timeout: 'Timed out.',
	unknown: 'Error.',
};

export const SCANNING_MESSAGE = 'Scanning for listening ports…';
export const EMPTY_MESSAGE = 'No listening ports';
const STALE_NOTE = 'Showing the last known list.';

export function formatPortLabel(info: PortInfo): string {
	return String(info.port);
}

/** Protocol, process, PID and user; a hidden process has only the protocol to show. */
export function formatPortDescription(info: PortInfo): string {
	if (info.pid === undefined) {
		return [info.protocol, 'process hidden'].join(SEPARATOR);
	}
	const parts = [info.protocol, info.processName ?? 'unknown process', `PID ${info.pid}`];
	if (info.user !== undefined) {
		parts.push(info.user);
	}
	return parts.join(SEPARATOR);
}

/** Wraps text in a code span/fence long enough that backticks inside it cannot end it early. */
function asCode(text: string, block: boolean): string {
	const longestRun = Math.max(0, ...(text.match(/`+/g) ?? []).map(run => run.length));
	const fence = '`'.repeat(Math.max(longestRun + 1, block ? 3 : 1));
	return block ? `${fence}\n${text}\n${fence}` : `${fence} ${text} ${fence}`;
}

/** Markdown for the hover tooltip, including the full command and bind address. */
export function buildPortTooltip(info: PortInfo, protection?: string, label?: string): string {
	const process =
		info.pid === undefined
			? 'Process: hidden (it probably belongs to another user)'
			: `Process: ${asCode(`${info.processName ?? 'unknown'} (PID ${info.pid})`, false)}`;
	const sections = [
		`**Port ${info.port}** (${info.protocol})`,
		label ? `Name: ${asCode(label, false)}` : undefined,
		`Address: ${asCode(info.address, false)}`,
		process,
		info.user === undefined ? undefined : `User: ${asCode(info.user, false)}`,
		info.command ? `Command:\n${asCode(info.command, true)}` : undefined,
		info.cwd ? `Working directory: ${asCode(info.cwd, false)}` : undefined,
		protection ? `**Protected:** ${protection}. Port Manager will not stop it.` : undefined,
	];
	return sections.filter(section => section !== undefined).join('\n\n');
}

export interface StatusBarView {
	text: string;
	tooltip: string;
	/** True when the latest scan failed, so the item can stand out. */
	warning: boolean;
}

/** The status bar shows exactly the rows the tree shows, so the two cannot disagree. */
export function describeStatusBar(state: PortsState, runningOnly = false): StatusBarView {
	if (!state.loaded) {
		return { text: '$(plug) …', tooltip: SCANNING_MESSAGE, warning: false };
	}
	const count = scopePorts(state.ports, runningOnly).length;
	const scope = runningOnly ? ' (running only)' : '';
	const summary = `${count} listening ${count === 1 ? 'port' : 'ports'}${scope}. Click to open Port Manager.`;
	if (state.error) {
		return { text: `$(plug) ${count}`, tooltip: `${ERROR_HEADLINE[state.error.kind]} ${state.error.message}\n${summary}`, warning: true };
	}
	return { text: `$(plug) ${count}`, tooltip: summary, warning: false };
}

export interface ListCounts {
	/** Ports in scope: all of them, or only the running ones. */
	inScope: number;
	/** In scope and matching the search. */
	shown: number;
	/** Left out by "running only". */
	hidden: number;
	query: string;
}

/** What to say above the rows: why they are missing, or the loading, empty and error text. */
export function describeListMessage(state: PortsState, { inScope, shown, hidden, query }: ListCounts): string | undefined {
	if (inScope === 0 && hidden > 0) {
		return `Nothing running that Port Manager can identify. ${hidden} ${hidden === 1 ? 'port has' : 'ports have'} a hidden process and ${hidden === 1 ? 'is' : 'are'} not shown.`;
	}
	if (inScope > 0 && shown === 0) {
		return `No ports match “${query.trim()}”.`;
	}
	return describeViewMessage(state);
}

/** The text shown above the tree for the loading, empty and error states; undefined when there is nothing to say. */
export function describeViewMessage(state: PortsState): string | undefined {
	if (!state.loaded) {
		return SCANNING_MESSAGE;
	}
	if (state.error) {
		const note = state.ports.length > 0 ? ` ${STALE_NOTE}` : '';
		return `${ERROR_HEADLINE[state.error.kind]} ${state.error.message}${note}`;
	}
	return state.ports.length === 0 ? EMPTY_MESSAGE : undefined;
}
