import { PortInfo, UNKNOWN_LABEL } from '../port-types';
import { parseHostPort } from './parse-host-port';

const LISTEN_STATE = '(LISTEN)';
const TCP_NODE = 'TCP';
const MIN_TOKENS = 5;
/** Tokens after PID in a full row: USER FD TYPE DEVICE SIZE/OFF NODE NAME (LISTEN). */
const TOKENS_AFTER_PID_WITH_USER = 8;

const isNumber = (token: string): boolean => /^\d+$/.test(token);

/** lsof prints spaces in command names as "\x20". */
const unescapeCommand = (name: string): string =>
	name.replace(/\\x([0-9a-f]{2})/gi, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));

function parseRow(line: string): PortInfo | undefined {
	const tokens = line.trim().split(/\s+/);
	const count = tokens.length;
	if (count < MIN_TOKENS || tokens[count - 1] !== LISTEN_STATE || tokens[count - 3] !== TCP_NODE) {
		return undefined;
	}
	const local = parseHostPort(tokens[count - 2]);
	if (!local) {
		return undefined;
	}
	// The PID is the first numeric column; if the COMMAND column is missing it comes first.
	const hasCommand = isNumber(tokens[1]);
	const pidIndex = hasCommand ? 1 : 0;
	const hasUser = count - pidIndex - 1 >= TOKENS_AFTER_PID_WITH_USER;
	return {
		...local,
		protocol: 'tcp',
		pid: isNumber(tokens[pidIndex]) ? Number(tokens[pidIndex]) : undefined,
		processName: hasCommand ? unescapeCommand(tokens[0]) : UNKNOWN_LABEL,
		user: hasUser ? tokens[pidIndex + 1] : UNKNOWN_LABEL,
	};
}

/**
 * Parses the default table printed by `lsof -iTCP -sTCP:LISTEN -nP` (macOS):
 *   COMMAND PID USER FD TYPE DEVICE SIZE/OFF NODE NAME
 * The NAME column is anchored from the end of the row, and USER or COMMAND may be missing.
 */
export function parseLsofTable(output: string): PortInfo[] {
	const ports: PortInfo[] = [];
	for (const line of output.split('\n')) {
		const port = parseRow(line);
		if (port) {
			ports.push(port);
		}
	}
	return ports;
}
