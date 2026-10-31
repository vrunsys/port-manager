import { PortsErrorKind } from './port-errors';
import { PortInfo, UNKNOWN_LABEL } from './port-types';
import { PortsState } from './ports-service';

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
	const parts = [info.protocol, info.processName, `PID ${info.pid}`];
	if (info.user !== UNKNOWN_LABEL) {
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
export function buildPortTooltip(info: PortInfo): string {
	const process =
		info.pid === undefined
			? 'Process: hidden (it probably belongs to another user)'
			: `Process: ${asCode(`${info.processName} (PID ${info.pid})`, false)}`;
	const sections = [
		`**Port ${info.port}** (${info.protocol})`,
		`Address: ${asCode(info.address, false)}`,
		process,
		info.user === UNKNOWN_LABEL ? undefined : `User: ${asCode(info.user, false)}`,
		info.command ? `Command:\n${asCode(info.command, true)}` : undefined,
		info.cwd ? `Working directory: ${asCode(info.cwd, false)}` : undefined,
	];
	return sections.filter(section => section !== undefined).join('\n\n');
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
