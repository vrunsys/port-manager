import { PortInfo } from '../port-types';
import { LabelSource } from './port-labels';

export type SortMode = 'port' | 'pid' | 'name';

export const SORT_MODES: readonly SortMode[] = ['port', 'pid', 'name'];
export const DEFAULT_SORT: SortMode = 'port';

const SORT_NAMES: Record<SortMode, string> = { port: 'Port', pid: 'PID', name: 'Name' };
const HIDDEN_PROCESS_NAME = 'Unknown process';

export const isSortMode = (value: unknown): value is SortMode => SORT_MODES.includes(value as SortMode);
export const sortName = (mode: SortMode): string => SORT_NAMES[mode];

/** A port whose process is hidden (another user's) cannot be named or stopped, so "running only" leaves it out. */
export const isIdentified = (info: PortInfo): boolean => info.pid !== undefined;

/** The ports the view works with: all of them, or only those whose running process can be identified. */
export function scopePorts(ports: readonly PortInfo[], runningOnly: boolean): PortInfo[] {
	return runningOnly ? ports.filter(isIdentified) : [...ports];
}

/** The name you gave the port, or else the process name. */
export function rowTitle(info: PortInfo, label: string | undefined): string {
	return label ?? (info.pid === undefined ? HIDDEN_PROCESS_NAME : info.processName);
}

/** The row text: port first, then the name, like the badge and title of a server card. */
export function rowLabel(info: PortInfo, label: string | undefined): string {
	return `${info.port}  ${rowTitle(info, label)}`;
}

/** "::1" becomes "[::1]"; wildcards and IPv4 stay as they are. Merged addresses ("0.0.0.0, ::") are handled one by one. */
function formatAddress(address: string): string {
	return address
		.split(', ')
		.map(part => (part.includes(':') ? `[${part}]` : part))
		.join(', ');
}

/** The grey text: where it listens (or what process, if it has a name of its own) and the pid. */
export function rowMeta(info: PortInfo, label: string | undefined): string {
	if (info.pid === undefined) {
		return `${formatAddress(info.address)} · process hidden`;
	}
	return `${label ? info.processName : formatAddress(info.address)} · pid ${info.pid}`;
}

/** Every word you type must appear somewhere in the row: port, name, process, PID, address or command. */
export function filterPorts(ports: readonly PortInfo[], query: string, labels: LabelSource): PortInfo[] {
	const words = query.toLowerCase().split(/\s+/).filter(Boolean);
	if (words.length === 0) {
		return [...ports];
	}
	return ports.filter(info => {
		const text = [info.port, info.protocol, labels.get(info.port), info.processName, info.pid, info.address, info.command, info.user]
			.filter(part => part !== undefined)
			.join(' ')
			.toLowerCase();
		return words.every(word => text.includes(word));
	});
}

const byPort = (a: PortInfo, b: PortInfo) => a.port - b.port || (a.pid ?? Infinity) - (b.pid ?? Infinity);

export function sortPorts(ports: readonly PortInfo[], mode: SortMode, labels: LabelSource): PortInfo[] {
	const sorted = [...ports];
	switch (mode) {
		case 'port':
			return sorted.sort(byPort);
		case 'pid':
			return sorted.sort((a, b) => (a.pid ?? Infinity) - (b.pid ?? Infinity) || a.port - b.port);
		case 'name':
			return sorted.sort(
				(a, b) =>
					rowTitle(a, labels.get(a.port)).localeCompare(rowTitle(b, labels.get(b.port)), undefined, { sensitivity: 'base' }) ||
					byPort(a, b),
			);
	}
}

/**
 * The grey text next to the view's title: "8 running · Sort: PID", "3 of 8 · Sort: PID" while searching,
 * and "5 running · 3 hidden · Sort: Port" when "running only" tucks rows away.
 */
export function describeHeader(total: number, shown: number, sort: SortMode, hidden = 0): string {
	const count = shown === total ? `${total} running` : `${shown} of ${total}`;
	return [count, hidden > 0 ? `${hidden} hidden` : undefined, `Sort: ${sortName(sort)}`].filter(Boolean).join(' · ');
}
