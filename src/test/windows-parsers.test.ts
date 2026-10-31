import * as assert from 'assert';
import { parsePowerShellPorts } from '../features/ports/parsers/powershell-parser';
import { parseTasklistCsv } from '../features/ports/parsers/tasklist-parser';
import { parseWindowsNetstat } from '../features/ports/parsers/windows-netstat-parser';
import { UNKNOWN_LABEL } from '../features/ports/port-types';
import {
	WINDOWS_NETSTAT_DE_OUTPUT,
	WINDOWS_NETSTAT_EN_OUTPUT,
	WINDOWS_POWERSHELL_JSON,
	WINDOWS_TASKLIST_OUTPUT,
} from './fixtures/port-tool-output';

suite('parsePowerShellPorts', () => {
	const ports = parsePowerShellPorts(WINDOWS_POWERSHELL_JSON);

	test('maps every JSON entry to a port', () => {
		assert.deepStrictEqual(
			ports.map(p => [p.port, p.address, p.pid, p.processName]),
			[
				[135, '0.0.0.0', 1032, 'svchost'],
				[3000, '::', 5521, 'node'],
				[49670, 'fe80::1', 4, UNKNOWN_LABEL],
			],
		);
	});

	test('uses the executable path as the command when known', () => {
		assert.strictEqual(ports[1].command, 'C:\\Program Files\\nodejs\\node.exe');
		assert.strictEqual(ports[0].command, undefined);
	});

	test('accepts the bare object ConvertTo-Json prints for a single result', () => {
		const single = JSON.stringify({ Port: 80, Address: '0.0.0.0', Pid: 7, ProcessName: 'nginx', Path: null });
		assert.deepStrictEqual(parsePowerShellPorts(single).map(p => p.port), [80]);
	});

	test('returns nothing for empty output and for an empty array', () => {
		assert.deepStrictEqual(parsePowerShellPorts(''), []);
		assert.deepStrictEqual(parsePowerShellPorts('  \r\n'), []);
		assert.deepStrictEqual(parsePowerShellPorts('[]'), []);
	});

	test('tolerates a leading byte order mark', () => {
		assert.strictEqual(parsePowerShellPorts('\uFEFF' + WINDOWS_POWERSHELL_JSON).length, 3);
	});

	test('skips entries without a valid port or address', () => {
		const output = JSON.stringify([{ Port: 0, Address: '0.0.0.0' }, { Port: 80 }, 'text', null]);
		assert.deepStrictEqual(parsePowerShellPorts(output), []);
	});

	test('throws a clear error for output that is not JSON', () => {
		assert.throws(() => parsePowerShellPorts('Get-NetTCPConnection : not recognized'), /not return valid JSON/);
	});
});

suite('parseWindowsNetstat', () => {
	test('finds listening TCP rows in German output without matching the state word', () => {
		const ports = parseWindowsNetstat(WINDOWS_NETSTAT_DE_OUTPUT);
		assert.deepStrictEqual(
			ports.map(p => [p.port, p.address, p.pid]),
			[[135, '0.0.0.0', 1032], [3000, '0.0.0.0', 5521], [135, '::', 1032]],
		);
	});

	test('gives the same result shape for English output', () => {
		const ports = parseWindowsNetstat(WINDOWS_NETSTAT_EN_OUTPUT);
		assert.deepStrictEqual(ports.map(p => [p.port, p.pid]), [[445, 4], [139, 4]]);
	});

	test('leaves the process name unknown until tasklist is joined', () => {
		assert.strictEqual(parseWindowsNetstat(WINDOWS_NETSTAT_EN_OUTPUT)[0].processName, UNKNOWN_LABEL);
	});

	test('returns nothing for empty output', () => {
		assert.deepStrictEqual(parseWindowsNetstat(''), []);
	});
});

suite('parseTasklistCsv', () => {
	test('maps pid to image name by column position, keeping quoted commas intact', () => {
		const names = parseTasklistCsv(WINDOWS_TASKLIST_OUTPUT);
		assert.strictEqual(names.get(1032), 'svchost.exe');
		assert.strictEqual(names.get(5521), 'node.exe');
		assert.strictEqual(names.get(0), 'System Idle Process');
		assert.strictEqual(names.size, 4);
	});

	test('ignores blank and malformed lines', () => {
		assert.strictEqual(parseTasklistCsv('\n"only one field"\n"x","notanumber"\n').size, 0);
	});
});
