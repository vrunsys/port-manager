import { CommandError, RunCommandOptions } from '../../shared/run-command';

export type CommandRunner = (file: string, args: string[], options?: RunCommandOptions) => Promise<string>;

/**
 * ss, lsof and ps exit non-zero in harmless cases (nothing matched, a PID already
 * exited), so output from such a run is kept unless stderr says it really failed.
 */
export async function runKeepingOutput(run: CommandRunner, file: string, args: string[]): Promise<string> {
	try {
		return await run(file, args);
	} catch (error) {
		const harmless =
			error instanceof CommandError &&
			error.failure === 'failed' &&
			(error.stdout.trim() !== '' || error.stderr.trim() === '');
		if (harmless) {
			return error.stdout;
		}
		throw error;
	}
}
