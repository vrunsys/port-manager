import { runCommand } from '../../../shared/run-command';
import { CommandRunner } from '../command-runner';
import { parsePowerShellPorts } from '../parsers/powershell-parser';
import { parseTasklistCsv } from '../parsers/tasklist-parser';
import { parseWindowsNetstat } from '../parsers/windows-netstat-parser';
import { killWindowsProcess } from '../kill/windows-kill';
import { KillResult, PlatformAdapter, PortInfo } from '../port-types';
import { POWERSHELL_LIST_ARGS } from './powershell-script';

// Cold PowerShell start can take seconds; generous until measured by scripts/spike-windows-ports.js.
const POWERSHELL_TIMEOUT_MS = 15_000;

function describe(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

export class WindowsAdapter implements PlatformAdapter {
	constructor(private readonly run: CommandRunner = runCommand) {}

	async listPorts(): Promise<PortInfo[]> {
		let powerShellFailure: string;
		try {
			return parsePowerShellPorts(await this.runPowerShell());
		} catch (error) {
			powerShellFailure = describe(error);
		}
		try {
			return await this.listWithNetstat();
		} catch (error) {
			throw new Error(
				`Could not list ports. PowerShell: ${powerShellFailure}; netstat/tasklist: ${describe(error)}`,
			);
		}
	}

	killProcess(pid: number): Promise<KillResult> {
		return killWindowsProcess(pid, this.run);
	}

	private runPowerShell(): Promise<string> {
		return this.run('powershell.exe', [...POWERSHELL_LIST_ARGS], { timeoutMs: POWERSHELL_TIMEOUT_MS });
	}

	private async listWithNetstat(): Promise<PortInfo[]> {
		const ports = parseWindowsNetstat(await this.run('netstat', ['-ano']));
		if (ports.length === 0) {
			return ports;
		}
		const names = parseTasklistCsv(await this.run('tasklist', ['/FO', 'CSV', '/NH']));
		return ports.map(port => {
			const processName = port.pid === undefined ? undefined : names.get(port.pid);
			return processName ? { ...port, processName } : port;
		});
	}
}
