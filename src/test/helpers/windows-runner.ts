import * as path from 'path';
import { CommandError, RunCommandOptions } from '../../shared/run-command';

type ToolName = 'powershell' | 'netstat' | 'tasklist' | 'taskkill';
type Response = string | CommandError | ((args: string[]) => string);

/** "C:\Windows\System32\netstat.exe" -> "netstat": the adapters call the tools by absolute path. */
export function toolName(file: string): string {
	return path.win32.basename(file).replace(/\.exe$/i, '').toLowerCase();
}

/** A stand-in for running Windows tools: answers by tool name, and records every call (path, arguments, options). */
export function fakeWindowsRunner(responses: Partial<Record<ToolName, Response>>) {
	const calls: Array<{ tool: string; file: string; args: string[]; options?: RunCommandOptions }> = [];
	const run = async (file: string, args: string[], options?: RunCommandOptions): Promise<string> => {
		const tool = toolName(file);
		calls.push({ tool, file, args, options });
		const response = responses[tool as ToolName];
		if (response === undefined) {
			throw new CommandError(`${tool} missing`, 'not-found', '', '');
		}
		if (response instanceof CommandError) {
			throw response;
		}
		return typeof response === 'function' ? response(args) : response;
	};
	return { run, calls, tools: () => calls.map(call => call.tool) };
}
