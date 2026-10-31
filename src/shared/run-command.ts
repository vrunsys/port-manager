import { execFile, ExecFileException } from 'child_process';

const DEFAULT_TIMEOUT_MS = 5000;
const MAX_OUTPUT_BYTES = 10 * 1024 * 1024;

export interface RunCommandOptions {
	timeoutMs?: number;
}

export type CommandFailure = 'not-found' | 'timeout' | 'failed';

/**
 * Keeps stdout/stderr on the error because some tools report useful output
 * with a non-zero exit (e.g. lsof exits 1 when nothing matches).
 */
export class CommandError extends Error {
	constructor(
		message: string,
		readonly failure: CommandFailure,
		readonly stdout: string,
		readonly stderr: string,
	) {
		super(message);
		this.name = 'CommandError';
	}
}

function describeFailure(file: string, error: ExecFileException, timeoutMs: number): {
	failure: CommandFailure;
	message: string;
} {
	if (error.code === 'ENOENT') {
		return { failure: 'not-found', message: `"${file}" is not installed or not on PATH.` };
	}
	if (error.killed) {
		return { failure: 'timeout', message: `"${file}" did not finish within ${timeoutMs} ms.` };
	}
	return { failure: 'failed', message: `"${file}" failed: ${error.message}` };
}

/** Runs a program directly (no shell), so arguments are never interpreted or injected. */
export function runCommand(file: string, args: string[], options: RunCommandOptions = {}): Promise<string> {
	const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
	return new Promise((resolve, reject) => {
		execFile(file, args, { timeout: timeoutMs, maxBuffer: MAX_OUTPUT_BYTES }, (error, stdout, stderr) => {
			if (!error) {
				resolve(stdout);
				return;
			}
			const { failure, message } = describeFailure(file, error, timeoutMs);
			reject(new CommandError(message, failure, stdout, stderr));
		});
	});
}
