const MIN_PORT = 1;
const MAX_PORT = 65535;

export interface HostPort {
	address: string;
	port: number;
}

/** Splits "host:port" as printed by ss, lsof and netstat, including "[::1]:80" and ":::22". */
export function parseHostPort(text: string): HostPort | undefined {
	const separator = text.lastIndexOf(':');
	if (separator < 0) {
		return undefined;
	}
	const port = Number(text.slice(separator + 1));
	if (!Number.isInteger(port) || port < MIN_PORT || port > MAX_PORT) {
		return undefined;
	}
	const address = text
		.slice(0, separator)
		.replace(/^\[|\]$/g, '')
		// ss appends the interface to some addresses ("127.0.0.53%lo").
		.replace(/%.*$/, '');
	return { address, port };
}
