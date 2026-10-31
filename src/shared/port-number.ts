const MIN_PORT = 1;
const MAX_PORT = 65535;

export function isValidPort(port: unknown): port is number {
	return typeof port === 'number' && Number.isInteger(port) && port >= MIN_PORT && port <= MAX_PORT;
}
