import { PortInfo, UNKNOWN_LABEL } from '../port-types';
import { parseHostPort } from './parse-host-port';

// "TCP  0.0.0.0:135  0.0.0.0:0  LISTENING  1032" - the state is localized and may be several words
// ("IN ASCOLTO" in Italian), so everything between the peer address and the PID is ignored.
const TCP_ROW = /^TCP\s+(\S+)\s+(\S+)\s+.+?\s+(\d+)$/i;
const NO_PEER_SUFFIX = ':0';

/**
 * Parses `netstat -ano`. A listening socket is recognised by having no peer (port 0)
 * instead of by the localized "LISTENING" text. UDP rows and headers never match.
 */
export function parseWindowsNetstat(output: string): PortInfo[] {
	const ports: PortInfo[] = [];
	for (const line of output.split('\n')) {
		const row = TCP_ROW.exec(line.trim());
		if (!row || !row[2].endsWith(NO_PEER_SUFFIX)) {
			continue;
		}
		const local = parseHostPort(row[1]);
		if (!local) {
			continue;
		}
		ports.push({
			...local,
			protocol: 'tcp',
			pid: Number(row[3]),
			processName: UNKNOWN_LABEL,
			user: UNKNOWN_LABEL,
		});
	}
	return ports;
}
