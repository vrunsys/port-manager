export interface ProcessDetails {
	user: string;
	command: string;
}

/** Parses `ps -o pid=,user:32=,args=` into a PID -> details map. */
export function parsePs(output: string): Map<number, ProcessDetails> {
	const details = new Map<number, ProcessDetails>();
	for (const line of output.split('\n')) {
		const match = /^\s*(\d+)\s+(\S+)\s+(.*)$/.exec(line);
		if (match) {
			details.set(Number(match[1]), { user: match[2], command: match[3] });
		}
	}
	return details;
}
