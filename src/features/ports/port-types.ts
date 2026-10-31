export type PortProtocol = 'tcp' | 'udp';

/** Shown for fields we cannot read, e.g. processes owned by another user. */
export const UNKNOWN_LABEL = 'unknown';

export interface PortInfo {
	port: number;
	protocol: PortProtocol;
	/** Bind address, e.g. "127.0.0.1", "::" or "*". */
	address: string;
	/** Undefined when the owning process is hidden from us. */
	pid: number | undefined;
	processName: string;
	user: string;
	command?: string;
	cwd?: string;
}

export interface KillOptions {
	/** Send SIGKILL instead of asking the process to exit with SIGTERM. */
	force?: boolean;
}

/** Implemented once per operating system; the rest of the extension only sees this. */
export interface PlatformAdapter {
	listPorts(): Promise<PortInfo[]>;
	killProcess(pid: number, options: KillOptions): Promise<void>;
}
