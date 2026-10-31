import { CommandRunner, runKeepingOutput } from './command-runner';
import { parsePs } from './parsers/ps-parser';
import { PortInfo, UNKNOWN_LABEL } from './port-types';

/**
 * Adds the full command line (and the user, when the listing tool did not report one)
 * by asking ps. `psFields` is the `-o` list, which differs slightly between OSes.
 */
export async function addProcessDetails(run: CommandRunner, ports: PortInfo[], psFields: string): Promise<PortInfo[]> {
	const pids = new Set<number>();
	for (const { pid } of ports) {
		if (pid !== undefined) {
			pids.add(pid);
		}
	}
	if (pids.size === 0) {
		return ports;
	}
	const output = await runKeepingOutput(run, 'ps', ['-o', psFields, '-p', [...pids].join(',')]);
	const details = parsePs(output);
	return ports.map(port => {
		const found = port.pid === undefined ? undefined : details.get(port.pid);
		if (!found) {
			return port;
		}
		return {
			...port,
			user: port.user === UNKNOWN_LABEL ? found.user : port.user,
			command: found.command,
		};
	});
}
