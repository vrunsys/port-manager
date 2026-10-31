// Spike for the Windows PowerShell path. Run on Windows 10/11 after `npm run compile-tests`:
//   node scripts/spike-windows-ports.js
// Reports whether the script runs and parses, and how long a PowerShell start takes.
const { execFile } = require('child_process');
const { promisify } = require('util');

const RUNS = 5;
const TIMEOUT_MS = 60_000;
const run = promisify(execFile);

function loadBuiltModules() {
	try {
		return {
			...require('../out/features/ports/windows/powershell-script'),
			...require('../out/features/ports/parsers/powershell-parser'),
		};
	} catch {
		throw new Error('Compiled output not found. Run `npm run compile-tests` first.');
	}
}

async function timedRun(POWERSHELL_LIST_ARGS) {
	const started = process.hrtime.bigint();
	const { stdout } = await run('powershell.exe', POWERSHELL_LIST_ARGS, { timeout: TIMEOUT_MS, maxBuffer: 10 * 1024 * 1024 });
	return { stdout, ms: Number(process.hrtime.bigint() - started) / 1e6 };
}

async function main() {
	if (process.platform !== 'win32') {
		throw new Error('This spike must be run on Windows.');
	}
	const { POWERSHELL_LIST_ARGS, parsePowerShellPorts } = loadBuiltModules();
	const timings = [];
	let stdout = '';
	for (let i = 0; i < RUNS; i++) {
		const result = await timedRun(POWERSHELL_LIST_ARGS);
		stdout = result.stdout;
		timings.push(Math.round(result.ms));
	}
	const ports = parsePowerShellPorts(stdout);
	console.log(`Parsed ${ports.length} listening ports; first 5:`);
	console.table(ports.slice(0, 5).map(({ port, address, pid, processName }) => ({ port, address, pid, processName })));
	console.log(`Start + query times over ${RUNS} runs (ms), first is cold: ${timings.join(', ')}`);
	console.log(`Output began with BOM: ${stdout.charCodeAt(0) === 0xfeff}`);
}

main().catch(error => {
	console.error('Spike failed:', error.message);
	process.exit(1);
});
