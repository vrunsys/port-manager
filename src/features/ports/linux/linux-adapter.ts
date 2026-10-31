import { CommandError, runCommand } from '../../../shared/run-command';
import { CommandRunner, runKeepingOutput } from '../command-runner';
import { killUnixProcess } from '../kill/unix-kill';
import { PortListingError } from '../port-errors';
import { KillOptions, KillResult, PlatformAdapter, PortInfo } from '../port-types';
import { addProcessDetails } from '../process-details';
import { LISTING_TOOLS } from './listing-tools';

const PS_FIELDS = 'pid=,user:32=,args=';

function isMissingTool(error: unknown): boolean {
	return error instanceof CommandError && error.failure === 'not-found';
}

export class LinuxAdapter implements PlatformAdapter {
	constructor(private readonly run: CommandRunner = runCommand) {}

	async listPorts(): Promise<PortInfo[]> {
		// ss and netstat do not report users or command lines, so ask ps.
		return addProcessDetails(this.run, await this.listWithFirstAvailableTool(), PS_FIELDS);
	}

	killProcess(pid: number, options?: KillOptions): Promise<KillResult> {
		return killUnixProcess(pid, options);
	}

	private async listWithFirstAvailableTool(): Promise<PortInfo[]> {
		for (const tool of LISTING_TOOLS) {
			try {
				return tool.parse(await runKeepingOutput(this.run, tool.file, tool.args));
			} catch (error) {
				if (!isMissingTool(error)) {
					throw error;
				}
			}
		}
		const names = LISTING_TOOLS.map(tool => tool.file).join(', ');
		throw new PortListingError(`Could not list ports: none of ${names} is installed.`, 'tool-missing');
	}
}
