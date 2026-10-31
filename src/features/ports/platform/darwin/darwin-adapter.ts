import { CommandRunner, runCommand } from '../../../../shared/run-command';
import { KillOptions, KillResult, PlatformAdapter, PortInfo } from '../../port-types';
import { runKeepingOutput } from '../command-runner';
import { withListingErrors } from '../listing-error';
import { parseLsofTable } from '../parsers/lsof-table-parser';
import { addProcessDetails } from '../process-details';
import { killUnixProcess } from '../unix/unix-kill';

// +c 0: without it lsof cuts command names to nine characters ("ControlCe").
const LSOF_ARGS = ['-iTCP', '-sTCP:LISTEN', '-nP', '+c', '0'];
// lsof walks every open file, which can take several seconds on a busy Mac.
const LSOF_TIMEOUT_MS = 15_000;
const PS_FIELDS = 'pid=,user=,args=';

export class DarwinAdapter implements PlatformAdapter {
	constructor(private readonly run: CommandRunner = runCommand) {}

	listPorts(): Promise<PortInfo[]> {
		return withListingErrors(async () => {
			const output = await runKeepingOutput(this.run, 'lsof', LSOF_ARGS, { timeoutMs: LSOF_TIMEOUT_MS });
			// lsof's table has no command line, so ask ps.
			return addProcessDetails(this.run, parseLsofTable(output), PS_FIELDS);
		});
	}

	killProcess(pid: number, options?: KillOptions): Promise<KillResult> {
		return killUnixProcess(pid, options);
	}
}
