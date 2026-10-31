import { parseLsof } from '../parsers/lsof-parser';
import { parseNetstat } from '../parsers/netstat-parser';
import { parseSs } from '../parsers/ss-parser';
import { PortInfo } from '../../port-types';

export interface ListingTool {
	file: string;
	args: string[];
	parse(output: string): PortInfo[];
}

/** In order of preference: the first one installed is used. */
export const LISTING_TOOLS: readonly ListingTool[] = [
	{ file: 'ss', args: ['-ltnp'], parse: parseSs },
	{ file: 'lsof', args: ['-iTCP', '-sTCP:LISTEN', '-P', '-n', '-F', 'pcLn'], parse: parseLsof },
	{ file: 'netstat', args: ['-tlnp'], parse: parseNetstat },
];
