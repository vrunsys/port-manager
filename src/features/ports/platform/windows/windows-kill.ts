import { errorMessage } from '../../../../shared/error-message';
import { logger } from '../../../../shared/logger';
import { CommandError, CommandRunner, runCommand } from '../../../../shared/run-command';
import { checkKillable } from '../../kill/kill-guards';
import { failed, killed, notFound, permissionDenied } from '../../kill/kill-results';
import { KillResult } from '../../port-types';
import { parseTasklistCsv } from '../parsers/tasklist-parser';
import { listAncestors } from './windows-ancestors';
import { windowsTool } from './windows-tools';

/** taskkill's exit codes: 128 = no such process, 1 = refused (e.g. access denied). Its text is localized. */
const EXIT_PROCESS_NOT_FOUND = 128;
const EXIT_REFUSED = 1;
/** Killing a whole tree can take a while. */
const TASKKILL_TIMEOUT_MS = 15_000;
const TASKLIST_TIMEOUT_MS = 10_000;

async function processExists(run: CommandRunner, pid: number): Promise<boolean> {
	const output = await run(windowsTool('tasklist'), ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH'], { timeoutMs: TASKLIST_TIMEOUT_MS });
	return parseTasklistCsv(output).has(pid);
}

async function mapTaskkillFailure(run: CommandRunner, pid: number, error: unknown): Promise<KillResult> {
	if (!(error instanceof CommandError) || error.failure !== 'failed') {
		return failed(`Could not stop process ${pid}: ${errorMessage(error)}`);
	}
	if (error.exitCode === EXIT_PROCESS_NOT_FOUND) {
		return notFound(pid);
	}
	// It may also have exited between listing and killing, which is not a refusal.
	if (!(await processExists(run, pid))) {
		return notFound(pid);
	}
	return error.exitCode === EXIT_REFUSED ? permissionDenied(pid) : failed(`Could not stop process ${pid}: ${error.message}`);
}

/**
 * taskkill /T /F ends the whole process tree; Windows has no graceful step for console apps.
 * /T would also take down VS Code if the target were an ancestor of the extension host, so those are
 * refused; and when the ancestry cannot be read, only the process itself is stopped (no /T).
 */
export async function killWindowsProcess(
	pid: number,
	run: CommandRunner = runCommand,
	ownPid: number = process.pid,
): Promise<KillResult> {
	const refusal = checkKillable(pid, ownPid, 'win32');
	if (refusal) {
		return refusal;
	}
	const ancestors = await listAncestors(run, ownPid);
	if (ancestors?.includes(pid)) {
		return failed(`Refusing to stop process ${pid}: it started the VS Code extension host, so stopping its process tree would close VS Code.`);
	}
	if (!ancestors) {
		logger.warn(`Stopping process ${pid} without /T because the extension host's parent chain is unknown.`);
	}
	try {
		await run(windowsTool('taskkill'), ['/PID', String(pid), ...(ancestors ? ['/T'] : []), '/F'], { timeoutMs: TASKKILL_TIMEOUT_MS });
		return killed(pid);
	} catch (error) {
		return mapTaskkillFailure(run, pid, error);
	}
}
