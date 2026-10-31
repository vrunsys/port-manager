/** The comparison form of a process name: case and a ".exe" suffix do not matter. */
export function normalizeProcessName(name: string): string {
	return name.trim().toLowerCase().replace(/\.exe$/, '');
}

// macOS apps: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome --flag" -> "Google Chrome".
const MACOS_APP_EXECUTABLE = /\.app\/Contents\/MacOS\/(.+?)(?:\s+-|$)/;

/**
 * The executable's file name from a command line. `ps` shows "/usr/bin/node server.js", macOS and
 * Windows paths may contain spaces, and some daemons rewrite their title ("sshd: user@pts/0").
 */
export function executableName(command: string): string {
	const trimmed = command.trim();
	const appName = MACOS_APP_EXECUTABLE.exec(trimmed)?.[1];
	const executable = appName ?? (/\.exe$/i.test(trimmed) ? trimmed : trimmed.split(/\s+/)[0]);
	return normalizeProcessName(executable.replace(/:$/, '').replace(/^.*[\\/]/, ''));
}
