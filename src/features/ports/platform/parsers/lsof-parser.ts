import { PortInfo } from '../../port-types';
import { parseHostPort } from './parse-host-port';

/**
 * Parses `lsof -iTCP -sTCP:LISTEN -P -n -F pcLn`. Each line is one field,
 * prefixed by its letter: p=pid, c=command name, L=login, n=address.
 * Sockets of processes we may not inspect are never listed by lsof.
 */
export function parseLsof(output: string): PortInfo[] {
	const ports: PortInfo[] = [];
	let pid: number | undefined;
	let processName: string | undefined;
	let user: string | undefined;
	for (const line of output.split('\n')) {
		const value = line.slice(1);
		switch (line[0]) {
			case 'p':
				pid = Number(value);
				processName = undefined;
				user = undefined;
				break;
			case 'c':
				processName = value;
				break;
			case 'L':
				user = value;
				break;
			case 'n': {
				const local = parseHostPort(value);
				if (local) {
					ports.push({ ...local, protocol: 'tcp', pid, processName, user });
				}
				break;
			}
		}
	}
	return ports;
}
