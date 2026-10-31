import * as fs from 'fs';

/** The state letter of a /proc/<pid>/stat line ("123 (name) Z 1 ..."): read after the LAST ")" since names may contain one. */
export function parseProcStatState(stat: string): string | undefined {
	const end = stat.lastIndexOf(')');
	return end < 0 ? undefined : /^\s*([A-Za-z])/.exec(stat.slice(end + 1))?.[1];
}

/** Undefined where /proc does not exist (macOS) or the process is already gone: "not known to be a zombie". */
export function readProcessState(pid: number): string | undefined {
	try {
		return parseProcStatState(fs.readFileSync(`/proc/${pid}/stat`, 'utf8'));
	} catch {
		return undefined;
	}
}
