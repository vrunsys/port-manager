import { execFile, ExecFileException } from 'child_process';

const DEFAULT_TIMEOUT_MS = 5000;
const MAX_OUTPUT_BYTES = 10 * 1024 * 1024;

export interface RunCommandOptions {
	timeoutMs?: number;
}

/** How the extension runs a program; adapters take one so tests can replace the operating system. */
export type CommandRunner = (file: string, args: string[], options?: RunCommandOptions) => Promise<string>;

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
		/** Set when the program ran and exited non-zero; lets callers avoid parsing localized text. */
		readonly exitCode?: number,
	) {
		super(message);
		this.name = 'CommandError';
	}
}

/**
 * Unix tools translate their messages (and net-tools even its "LISTEN" column) into the user's language.
 * Messages are forced to English; the character set is kept so non-ASCII process names survive.
 */
export function englishMessagesEnvironment(base: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
	const env: NodeJS.ProcessEnv = { ...base, LC_MESSAGES: 'C', LANGUAGE: 'C' };
	if (base.LC_ALL) {
		// LC_ALL would override LC_MESSAGES, so hand its value to the character-set category instead.
		env.LC_CTYPE = base.LC_ALL;
		delete env.LC_ALL;
	}
	return env;
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
		const env = process.platform === 'win32' ? process.env : englishMessagesEnvironment(process.env);
		// windowsHide: without it every spawn from the GUI extension host can flash a console window.
		const options = { timeout: timeoutMs, maxBuffer: MAX_OUTPUT_BYTES, windowsHide: true, env };
		execFile(file, args, options, (error, stdout, stderr) => {
			if (!error) {
				resolve(stdout);
				return;
			}
			const { failure, message } = describeFailure(file, error, timeoutMs);
			const exitCode = typeof error.code === 'number' ? error.code : undefined;
			reject(new CommandError(message, failure, stdout, stderr, exitCode));
		});
	});
}
