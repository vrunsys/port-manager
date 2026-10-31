import { errorMessage } from '../../../shared/error-message';
import { KillResult } from '../port-types';

export const killed = (pid: number): KillResult => ({ status: 'killed', message: `Stopped process ${pid}.` });

export const notFound = (pid: number): KillResult => ({
	status: 'not-found',
	message: `Process ${pid} is not running (it may have already exited).`,
});

export const permissionDenied = (pid: number): KillResult => ({
	status: 'permission-denied',
	message: `No permission to stop process ${pid}. It may belong to another user.`,
});

export const failed = (message: string): KillResult => ({ status: 'failed', message });

/** Maps the error thrown by process.kill to a result. */
export function fromSignalError(error: unknown, pid: number): KillResult {
	const code = (error as NodeJS.ErrnoException | null | undefined)?.code;
	if (code === 'ESRCH') {
		return notFound(pid);
	}
	if (code === 'EPERM') {
		return permissionDenied(pid);
	}
	return failed(`Could not stop process ${pid}: ${errorMessage(error)}`);
}
