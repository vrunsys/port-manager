import { parseLsof } from '../parsers/lsof-parser';
import { parseNetstat } from '../parsers/netstat-parser';
import { parseSs } from '../parsers/ss-parser';
import { PortInfo } from '../../port-types';

export interface ListingTool {
	file: string;
	args: string[];
	parse(output: string): PortInfo[];
	/** lsof walks every open file, which can take a while on a busy machine. */
	timeoutMs?: number;
}

const LSOF_TIMEOUT_MS = 15_000;

/** In order of preference: the first one that works is used. */
export const LISTING_TOOLS: readonly ListingTool[] = [
	{ file: 'ss', args: ['-ltnp'], parse: parseSs },
	{ file: 'lsof', args: ['-iTCP', '-sTCP:LISTEN', '-P', '-n', '+c', '0', '-F', 'pcLn'], parse: parseLsof, timeoutMs: LSOF_TIMEOUT_MS },
	{ file: 'netstat', args: ['-tlnp'], parse: parseNetstat },
];
