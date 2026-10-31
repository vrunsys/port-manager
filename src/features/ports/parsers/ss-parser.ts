import { PortInfo, UNKNOWN_LABEL } from '../port-types';
import { parseHostPort } from './parse-host-port';

// users:(("nginx",pid=812,fd=6),("nginx",pid=813,fd=6))
const PROCESS_PATTERN = /\("((?:[^"\\]|\\.)*)",pid=(\d+)/g;
const MIN_COLUMNS = 5;
const LOCAL_ADDRESS_COLUMN = 3;

/** Parses `ss -ltnp`. Rows without a users:(...) part belong to hidden processes. */
export function parseSs(output: string): PortInfo[] {
	const ports: PortInfo[] = [];
	for (const line of output.split('\n')) {
		const columns = line.trim().split(/\s+/);
		if (columns[0] !== 'LISTEN' || columns.length < MIN_COLUMNS) {
			continue;
		}
		const local = parseHostPort(columns[LOCAL_ADDRESS_COLUMN]);
		if (!local) {
			continue;
		}
		const base = { ...local, protocol: 'tcp' as const, user: UNKNOWN_LABEL };
		const processes = [...line.matchAll(PROCESS_PATTERN)];
		if (processes.length === 0) {
			ports.push({ ...base, pid: undefined, processName: UNKNOWN_LABEL });
			continue;
		}
		for (const [, processName, pid] of processes) {
			ports.push({ ...base, pid: Number(pid), processName });
		}
	}
	return ports;
}
