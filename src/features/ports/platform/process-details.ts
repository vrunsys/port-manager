import { errorMessage } from '../../../shared/error-message';
import { CommandRunner } from '../../../shared/run-command';
import { logger } from '../../../shared/logger';
import { PortInfo } from '../port-types';
import { runKeepingOutput } from './command-runner';
import { parsePs } from './parsers/ps-parser';

/**
 * Adds the full command line (and the user, when the listing tool did not report one) by asking ps.
 * `psFields` is the `-o` list, which differs slightly between OSes. This is a bonus: some systems
 * (BusyBox on Alpine) have a `ps` without `-p`, and then the ports are still listed, just without details.
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
	let output: string;
	try {
		output = await runKeepingOutput(run, 'ps', ['-o', psFields, '-p', [...pids].join(',')]);
	} catch (error) {
		logger.warn(`ps failed, so users and command lines are not shown: ${errorMessage(error)}`);
		return ports;
	}
	const details = parsePs(output);
	return ports.map(port => {
		const found = port.pid === undefined ? undefined : details.get(port.pid);
		if (!found) {
			return port;
		}
		return { ...port, user: port.user ?? found.user, command: found.command };
	});
}
