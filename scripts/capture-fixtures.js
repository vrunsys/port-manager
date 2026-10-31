// Saves the real output of the port-listing tools of THIS operating system as test fixtures:
//   node scripts/capture-fixtures.js <output-dir>
// Run it on Linux, macOS and Windows (ideally with a few servers listening, including IPv6 and
// wildcard binds) and commit the files under src/test/fixtures/<os>/. See src/test/fixtures/README.md.
// The current user name and home directory are replaced with "dev" so nothing personal is committed.
const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { promisify } = require('util');

const run = promisify(execFile);
const MAX_BUFFER = 10 * 1024 * 1024;
const TIMEOUT_MS = 60_000;

/** Tools exit non-zero in harmless cases (lsof with no match), so keep whatever they printed. */
async function capture(file, args) {
	try {
		return (await run(file, args, { maxBuffer: MAX_BUFFER, timeout: TIMEOUT_MS })).stdout;
	} catch (error) {
		if (error.code === 'ENOENT') {
			console.warn(`skipped: ${file} is not installed`);
			return undefined;
		}
		if (typeof error.stdout === 'string' && error.stdout !== '') {
			return error.stdout;
		}
		throw error;
	}
}

function pidsIn(...outputs) {
	const pids = new Set();
	for (const output of outputs.filter(Boolean)) {
		for (const match of output.matchAll(/(?:^p|pid=)(\d+)/gm)) {
			pids.add(match[1]);
		}
	}
	return [...pids];
}

function anonymize(text) {
	const user = os.userInfo().username;
	const home = os.homedir();
	return text.split(home).join(os.platform() === 'win32' ? 'C:\\Users\\dev' : '/home/dev').split(user).join('dev');
}

async function captureLinux() {
	const ss = await capture('ss', ['-ltnp']);
	const lsofFields = await capture('lsof', ['-iTCP', '-sTCP:LISTEN', '-P', '-n', '-F', 'pcLn']);
	const pids = pidsIn(ss, lsofFields);
	return {
		'ss.txt': ss,
		'lsof-fields.txt': lsofFields,
		'lsof-table.txt': await capture('lsof', ['-iTCP', '-sTCP:LISTEN', '-nP']),
		'netstat.txt': await capture('netstat', ['-tlnp']),
		'ps.txt': pids.length ? await capture('ps', ['-o', 'pid=,user:32=,args=', '-p', pids.join(',')]) : undefined,
	};
}

async function captureMacos() {
	const table = await capture('lsof', ['-iTCP', '-sTCP:LISTEN', '-nP']);
	const pids = pidsIn(table?.replace(/^\S+\s+(\d+)/gm, 'p$1'));
	return {
		'lsof-table.txt': table,
		'ps.txt': pids.length ? await capture('ps', ['-o', 'pid=,user=,args=', '-p', pids.join(',')]) : undefined,
	};
}

async function captureWindows() {
	const { loadTs } = require('./load-ts');
	const { POWERSHELL_LIST_ARGS } = loadTs('src/features/ports/windows/powershell-script.ts');
	return {
		'powershell.json': await capture('powershell.exe', POWERSHELL_LIST_ARGS),
		'netstat.txt': await capture('netstat', ['-ano']),
		'tasklist.csv': await capture('tasklist', ['/FO', 'CSV', '/NH']),
	};
}

async function main() {
	const outDir = process.argv[2];
	if (!outDir) {
		throw new Error('Usage: node scripts/capture-fixtures.js <output-dir>');
	}
	const captures = { linux: captureLinux, darwin: captureMacos, win32: captureWindows }[process.platform];
	if (!captures) {
		throw new Error(`Unsupported platform: ${process.platform}`);
	}
	fs.mkdirSync(outDir, { recursive: true });
	for (const [name, text] of Object.entries(await captures())) {
		if (text !== undefined) {
			fs.writeFileSync(path.join(outDir, name), anonymize(text));
			console.log(`wrote ${path.join(outDir, name)}`);
		}
	}
}

main().catch(error => {
	console.error('Capture failed:', error.message);
	process.exit(1);
});
