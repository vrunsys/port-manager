import { PortInfo } from '../../port-types';
import { parseHostPort } from './parse-host-port';

// tcp  0  0 127.0.0.1:631  0.0.0.0:*  LISTEN  1234/cupsd   (or "-" when hidden)
// The state column is not matched: `netstat -l` only prints listening sockets, and net-tools translates
// the word. The program name may contain spaces, so it takes the rest of the line.
const ROW_PATTERN = /^tcp6?\s+\d+\s+\d+\s+(\S+)\s+\S+\s+\S+\s+(?:(\d+)\/(.+?)|-)\s*$/;

/** Parses `netstat -tlnp`. */
export function parseNetstat(output: string): PortInfo[] {
	const ports: PortInfo[] = [];
	for (const line of output.split('\n')) {
		const match = ROW_PATTERN.exec(line.trim());
		const local = match && parseHostPort(match[1]);
		if (!match || !local) {
			continue;
		}
		const [, , pid, processName] = match;
		ports.push({
			...local,
			protocol: 'tcp',
			pid: pid === undefined ? undefined : Number(pid),
			processName,
			user: undefined,
		});
	}
	return ports;
}
