import * as assert from 'assert';
import { parsePowerShellPorts } from '../../../../features/ports/platform/parsers/powershell-parser';
import { UNKNOWN_LABEL } from '../../../../features/ports/port-types';
import { windows } from '../../../fixtures/load-fixtures';

suite('parsePowerShellPorts (sample JSON)', () => {
	const ports = parsePowerShellPorts(windows.powershellJson);

	test('maps every JSON entry to a port, keeping IPv4 and IPv6 rows apart', () => {
		assert.deepStrictEqual(
			ports.map(p => [p.port, p.address, p.pid, p.processName]),
			[
				[135, '0.0.0.0', 1032, 'svchost'],
				[135, '::', 1032, 'svchost'],
				[3000, '::', 5521, 'node'],
				[3001, '127.0.0.1', 5521, 'node'],
				[49670, 'fe80::1', 4, UNKNOWN_LABEL],
			],
		);
	});

	test('returns every listener of a process that holds several ports', () => {
		assert.deepStrictEqual(ports.filter(p => p.pid === 5521).map(p => p.port), [3000, 3001]);
	});

	test('uses the executable path as the command when it is known', () => {
		assert.strictEqual(ports[2].command, 'C:\\Program Files\\nodejs\\node.exe');
		assert.strictEqual(ports[0].command, undefined);
	});

	test('strips the zone id of a link-local address', () => {
		assert.strictEqual(ports[4].address, 'fe80::1');
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
		assert.strictEqual(parsePowerShellPorts('\uFEFF' + windows.powershellJson).length, 5);
	});

	test('skips entries without a valid port or address', () => {
		const output = JSON.stringify([{ Port: 0, Address: '0.0.0.0' }, { Port: 80 }, 'text', null]);
		assert.deepStrictEqual(parsePowerShellPorts(output), []);
	});

	test('throws a clear error for output that is not JSON', () => {
		assert.throws(() => parsePowerShellPorts('Get-NetTCPConnection : not recognized'), /not return valid JSON/);
	});
});
