import { errorMessage } from '../../../../shared/error-message';
import { logger } from '../../../../shared/logger';
import { CommandRunner, runCommand } from '../../../../shared/run-command';
import { KillResult, PlatformAdapter, PortInfo, PortListingError } from '../../port-types';
import { asListingError, withListingErrors } from '../listing-error';
import { parsePowerShellPorts } from '../parsers/powershell-parser';
import { parseTasklistCsv } from '../parsers/tasklist-parser';
import { parseWindowsNetstat } from '../parsers/windows-netstat-parser';
import { POWERSHELL_LIST_ARGS } from './powershell-script';
import { killWindowsProcess } from './windows-kill';
import { windowsTool } from './windows-tools';

// Cold PowerShell start can take seconds; generous until measured by scripts/spike-windows-ports.js.
const POWERSHELL_TIMEOUT_MS = 15_000;
const TOOL_TIMEOUT_MS = 10_000;
/** After PowerShell fails, use netstat and tasklist for this long instead of paying its timeout on every scan. */
const POWERSHELL_RETRY_MS = 5 * 60 * 1000;

export class WindowsAdapter implements PlatformAdapter {
	private powerShellRetryAt = 0;
	private lastPowerShellFailure = '';

	constructor(
		private readonly run: CommandRunner = runCommand,
		private readonly now: () => number = Date.now,
	) {}

	listPorts(): Promise<PortInfo[]> {
		return withListingErrors(() => this.list());
	}

	killProcess(pid: number): Promise<KillResult> {
		return killWindowsProcess(pid, this.run);
	}

	private async list(): Promise<PortInfo[]> {
		if (this.now() >= this.powerShellRetryAt) {
			try {
				return parsePowerShellPorts(await this.runPowerShell());
			} catch (error) {
				this.lastPowerShellFailure = errorMessage(error);
				this.powerShellRetryAt = this.now() + POWERSHELL_RETRY_MS;
				logger.warn(
					`PowerShell could not list ports (${this.lastPowerShellFailure}). Using netstat and tasklist, which show no command paths, for the next ${POWERSHELL_RETRY_MS / 60000} minutes.`,
				);
			}
		}
		try {
			return await this.listWithNetstat();
		} catch (error) {
			// Both paths failed: report both, and keep the kind of the last failure (permission, timeout...).
			const cause = asListingError(error);
			throw new PortListingError(
				`Could not list ports. PowerShell: ${this.lastPowerShellFailure || 'not tried'}; netstat/tasklist: ${cause.message}`,
				cause.kind,
			);
		}
	}

	private runPowerShell(): Promise<string> {
		return this.run(windowsTool('powershell'), [...POWERSHELL_LIST_ARGS], { timeoutMs: POWERSHELL_TIMEOUT_MS });
	}

	private async listWithNetstat(): Promise<PortInfo[]> {
		const ports = parseWindowsNetstat(await this.run(windowsTool('netstat'), ['-ano'], { timeoutMs: TOOL_TIMEOUT_MS }));
		if (ports.length === 0) {
			return ports;
		}
		const names = parseTasklistCsv(await this.run(windowsTool('tasklist'), ['/FO', 'CSV', '/NH'], { timeoutMs: TOOL_TIMEOUT_MS }));
		return ports.map(port => {
			const processName = port.pid === undefined ? undefined : names.get(port.pid);
			return processName ? { ...port, processName } : port;
		});
	}
}
