import { runCommand, CommandError } from '../../../shared/run-command';
import { CommandRunner } from '../command-runner';
import { parseTasklistCsv } from '../parsers/tasklist-parser';
import { KillResult } from '../port-types';
import { checkKillable } from './kill-guards';
import { failed, killed, notFound, permissionDenied } from './kill-results';

/** taskkill's exit codes: 128 = no such process, 1 = refused (e.g. access denied). Its text is localized. */
const EXIT_PROCESS_NOT_FOUND = 128;
const EXIT_REFUSED = 1;

async function processExists(run: CommandRunner, pid: number): Promise<boolean> {
	const output = await run('tasklist', ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH']);
	return parseTasklistCsv(output).has(pid);
}

async function mapTaskkillFailure(run: CommandRunner, pid: number, error: unknown): Promise<KillResult> {
	if (!(error instanceof CommandError) || error.failure !== 'failed') {
		return failed(`Could not stop process ${pid}: ${error instanceof Error ? error.message : String(error)}`);
	}
	if (error.exitCode === EXIT_PROCESS_NOT_FOUND) {
		return notFound(pid);
	}
	// It may also have exited between listing and killing, which is not a refusal.
	if (!(await processExists(run, pid))) {
		return notFound(pid);
	}
	return error.exitCode === EXIT_REFUSED
		? permissionDenied(pid)
		: failed(`Could not stop process ${pid}: ${error.message}`);
}

/** taskkill /T /F ends the whole process tree; Windows has no graceful step for console apps. */
export async function killWindowsProcess(pid: number, run: CommandRunner = runCommand): Promise<KillResult> {
	const refusal = checkKillable(pid);
	if (refusal) {
		return refusal;
	}
	try {
		await run('taskkill', ['/PID', String(pid), '/T', '/F']);
		return killed(pid);
	} catch (error) {
		return mapTaskkillFailure(run, pid, error);
	}
}
