import * as path from 'path';

export type WindowsTool = 'powershell' | 'netstat' | 'tasklist' | 'taskkill';

/**
 * Full path of a system tool. Bare names are looked up by Windows in the current directory and on PATH,
 * where a planted look-alike could be picked up; the real tools always live under System32.
 */
export function windowsTool(tool: WindowsTool, env: NodeJS.ProcessEnv = process.env): string {
	const system32 = path.win32.join(env.SystemRoot ?? env.windir ?? 'C:\\Windows', 'System32');
	return tool === 'powershell'
		? path.win32.join(system32, 'WindowsPowerShell', 'v1.0', 'powershell.exe')
		: path.win32.join(system32, `${tool}.exe`);
}
