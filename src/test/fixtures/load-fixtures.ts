import * as fs from 'fs';
import * as path from 'path';

// This file sits in the fixtures folder, so it finds them wherever the tests were started from.
const FIXTURE_DIR = __dirname;

export function fixture(relativePath: string): string {
	return fs.readFileSync(path.join(FIXTURE_DIR, relativePath), 'utf8');
}

/** Real output captured on Linux (see README.md in this folder). */
export const linux = {
	ss: fixture('linux/ss.txt'),
	lsofFields: fixture('linux/lsof-fields.txt'),
	lsofTable: fixture('linux/lsof-table.txt'),
	netstat: fixture('linux/netstat.txt'),
	ps: fixture('linux/ps.txt'),
};

/** Hand-built in macOS's format, NOT captured on a Mac (see README.md). */
export const macos = {
	lsofTable: fixture('macos/lsof-table.txt'),
	ps: fixture('macos/ps.txt'),
};

/** Hand-built, NOT captured on Windows (see README.md). */
export const windows = {
	powershellJson: fixture('windows/powershell.json'),
	tasklist: fixture('windows/tasklist.csv'),
	netstat: {
		en: fixture('windows/netstat-en.txt'),
		de: fixture('windows/netstat-de.txt'),
		fr: fixture('windows/netstat-fr.txt'),
		ru: fixture('windows/netstat-ru.txt'),
		it: fixture('windows/netstat-it.txt'),
	},
};
