import { runCommand } from '../../../shared/run-command';
import { CommandRunner, runKeepingOutput } from '../command-runner';
import { parseLsofTable } from '../parsers/lsof-table-parser';
import { killUnixProcess } from '../kill/unix-kill';
import { KillOptions, KillResult, PlatformAdapter, PortInfo } from '../port-types';
import { addProcessDetails } from '../process-details';

const LSOF_ARGS = ['-iTCP', '-sTCP:LISTEN', '-nP'];
const PS_FIELDS = 'pid=,user=,args=';

export class DarwinAdapter implements PlatformAdapter {
	constructor(private readonly run: CommandRunner = runCommand) {}

	async listPorts(): Promise<PortInfo[]> {
		const output = await runKeepingOutput(this.run, 'lsof', LSOF_ARGS);
		// lsof's table has no command line, so ask ps.
		return addProcessDetails(this.run, parseLsofTable(output), PS_FIELDS);
	}

	killProcess(pid: number, options?: KillOptions): Promise<KillResult> {
		return killUnixProcess(pid, options);
	}
}
