import { PortInfo } from './port-types';

const ADDRESS_SEPARATOR = ', ';

function mergeAddresses(first: string, second: string): string {
	const unique = new Set([...first.split(ADDRESS_SEPARATOR), ...second.split(ADDRESS_SEPARATOR)]);
	return [...unique].sort().join(ADDRESS_SEPARATOR);
}

function comparePorts(a: PortInfo, b: PortInfo): number {
	return (
		a.port - b.port ||
		(a.pid ?? Infinity) - (b.pid ?? Infinity) ||
		a.protocol.localeCompare(b.protocol)
	);
}

/**
 * One row per protocol + port + pid: the IPv4 and IPv6 sockets of a process are one
 * entry whose address lists both. Rows whose process is hidden share the key "no pid".
 * Sorted so the same input always gives the same output.
 */
export function dedupePorts(ports: readonly PortInfo[]): PortInfo[] {
	const merged = new Map<string, PortInfo>();
	for (const entry of ports) {
		const key = `${entry.protocol}:${entry.port}:${entry.pid ?? 'hidden'}`;
		const existing = merged.get(key);
		if (!existing) {
			merged.set(key, { ...entry });
			continue;
		}
		existing.address = mergeAddresses(existing.address, entry.address);
		existing.command ??= entry.command;
		existing.cwd ??= entry.cwd;
	}
	return [...merged.values()].sort(comparePorts);
}

function samePort(a: PortInfo, b: PortInfo): boolean {
	return (
		a.port === b.port &&
		a.protocol === b.protocol &&
		a.address === b.address &&
		a.pid === b.pid &&
		a.processName === b.processName &&
		a.user === b.user &&
		a.command === b.command &&
		a.cwd === b.cwd
	);
}

export function portListsEqual(a: readonly PortInfo[], b: readonly PortInfo[]): boolean {
	return a.length === b.length && a.every((entry, index) => samePort(entry, b[index]));
}
