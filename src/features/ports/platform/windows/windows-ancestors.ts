import { CommandRunner } from '../../../../shared/run-command';
import { errorMessage } from '../../../../shared/error-message';
import { logger } from '../../../../shared/logger';
import { powerShellArgs } from './powershell-script';
import { windowsTool } from './windows-tools';

const MAX_DEPTH = 32;
const TIMEOUT_MS = 15_000;

/** Walks from `pid` up through its parents. Only an integer is ever placed in the script. */
export function buildAncestorsScript(pid: number): string {
	if (!Number.isInteger(pid) || pid <= 0) {
		throw new Error(`Not a process id: ${pid}`);
	}
	return [
		"$ErrorActionPreference = 'Stop'",
		'$ids = @()',
		`$current = ${pid}`,
		`for ($i = 0; $i -lt ${MAX_DEPTH} -and $current -gt 0; $i++) {`,
		"  $process = Get-CimInstance Win32_Process -Filter ('ProcessId = ' + $current)",
		'  if (-not $process) { break }',
		'  $current = [int]$process.ParentProcessId',
		'  if ($current -gt 0) { $ids += $current }',
		'}',
		'ConvertTo-Json -InputObject @($ids) -Compress',
	].join('\n');
}

/** The ancestor ids from the script's JSON, or undefined if the output is not a list of positive integers. */
export function parseAncestors(output: string): number[] | undefined {
	try {
		const data: unknown = JSON.parse(output.replace(/^\uFEFF/, '').trim());
		const list = Array.isArray(data) ? data : [data];
		return list.every(id => Number.isInteger(id) && id > 0) ? (list as number[]) : undefined;
	} catch {
		return undefined;
	}
}

/**
 * The parents, grandparents and so on of `pid`, or undefined when they cannot be determined
 * (then the caller must assume nothing about them).
 */
export async function listAncestors(run: CommandRunner, pid: number): Promise<number[] | undefined> {
	try {
		const output = await run(windowsTool('powershell'), powerShellArgs(buildAncestorsScript(pid)), { timeoutMs: TIMEOUT_MS });
		return parseAncestors(output);
	} catch (error) {
		logger.warn(`Could not read the parent chain of process ${pid}: ${errorMessage(error)}`);
		return undefined;
	}
}
