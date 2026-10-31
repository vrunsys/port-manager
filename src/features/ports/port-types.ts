export type PortProtocol = 'tcp' | 'udp';

export interface PortInfo {
	port: number;
	protocol: PortProtocol;
	/** Bind address, e.g. "127.0.0.1", "::" or "*". */
	address: string;
	/** Undefined when the owning process is hidden from us. */
	pid: number | undefined;
	/** Undefined when the tool could not tell (hidden process, or a system process without a name). */
	processName: string | undefined;
	/** Undefined when the tool does not report it (ss, netstat, PowerShell) or the process is hidden. */
	user: string | undefined;
	command?: string;
	cwd?: string;
}

export interface KillOptions {
	/** macOS/Linux: skip SIGTERM and send SIGKILL immediately. Windows always forces. */
	force?: boolean;
	/** macOS/Linux: how long to wait after SIGTERM before sending SIGKILL. */
	gracePeriodMs?: number;
}

export type KillStatus = 'killed' | 'not-found' | 'permission-denied' | 'failed';

export interface KillResult {
	status: KillStatus;
	/** Ready to show to the user. */
	message: string;
}

/** Implemented once per operating system; the rest of the extension only sees this. */
export interface PlatformAdapter {
	listPorts(): Promise<PortInfo[]>;
	/** Never rejects for expected outcomes: they come back as a KillResult. */
	killProcess(pid: number, options?: KillOptions): Promise<KillResult>;
}

export type PortsErrorKind = 'tool-missing' | 'permission-denied' | 'timeout' | 'unknown';

/** A failure to list ports that an adapter has already understood, so nobody has to guess from text. */
export class PortListingError extends Error {
	constructor(
		message: string,
		readonly kind: PortsErrorKind,
	) {
		super(message);
		this.name = 'PortListingError';
	}
}
