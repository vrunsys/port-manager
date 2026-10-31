import { errorMessage } from '../../../../shared/error-message';
import { logger } from '../../../../shared/logger';
import { CommandError, CommandRunner, runCommand } from '../../../../shared/run-command';
import { PortListingError, KillOptions, KillResult, PlatformAdapter, PortInfo } from '../../port-types';
import { runKeepingOutput } from '../command-runner';
import { withListingErrors } from '../listing-error';
import { addProcessDetails } from '../process-details';
import { killUnixProcess } from '../unix/unix-kill';
import { LISTING_TOOLS } from './listing-tools';

const PS_FIELDS = 'pid=,user:32=,args=';

function isMissingTool(error: unknown): boolean {
	return error instanceof CommandError && error.failure === 'not-found';
}

export class LinuxAdapter implements PlatformAdapter {
	constructor(private readonly run: CommandRunner = runCommand) {}

	listPorts(): Promise<PortInfo[]> {
		// ss and netstat do not report users or command lines, so ask ps.
		return withListingErrors(async () => addProcessDetails(this.run, await this.listWithFirstWorkingTool(), PS_FIELDS));
	}

	killProcess(pid: number, options?: KillOptions): Promise<KillResult> {
		return killUnixProcess(pid, options);
	}

	/** Tries ss, then lsof, then netstat: a tool that is missing OR fails (e.g. no netlink in WSL1) hands over to the next. */
	private async listWithFirstWorkingTool(): Promise<PortInfo[]> {
		const failures: unknown[] = [];
		for (const tool of LISTING_TOOLS) {
			try {
				return tool.parse(await runKeepingOutput(this.run, tool.file, tool.args, { timeoutMs: tool.timeoutMs }));
			} catch (error) {
				if (!isMissingTool(error)) {
					failures.push(error);
					logger.warn(`${tool.file} could not list ports, trying the next tool: ${errorMessage(error)}`);
				}
			}
		}
		if (failures.length > 0) {
			throw failures[0];
		}
		const names = LISTING_TOOLS.map(tool => tool.file).join(', ');
		throw new PortListingError(`Could not list ports: none of ${names} is installed.`, 'tool-missing');
	}
}
