import * as assert from 'assert';
import { parseLsofTable } from '../features/ports/parsers/lsof-table-parser';
import { UNKNOWN_LABEL } from '../features/ports/port-types';
import { MACOS_LSOF_TABLE_OUTPUT } from './fixtures/port-tool-output';

suite('parseLsofTable', () => {
	const ports = parseLsofTable(MACOS_LSOF_TABLE_OUTPUT);

	test('returns port, pid and process for each fixture row, skipping the header', () => {
		assert.deepStrictEqual(
			ports.map(p => [p.port, p.pid, p.processName, p.user]),
			[
				[22, 1, 'launchd', 'root'],
				[49152, 412, 'rapportd', 'varun'],
				[49152, 412, 'rapportd', 'varun'],
				[7000, 498, 'ControlCe', 'varun'],
				[9222, 1203, 'Google Chrome', 'varun'],
				[3000, 5521, 'node', 'varun'],
				[5432, 7788, 'postgres', '_postgres'],
			],
		);
	});

	test('handles IPv4, IPv6 and *:PORT addresses', () => {
		assert.deepStrictEqual(
			ports.map(p => p.address),
			['*', '*', '*', '*', '127.0.0.1', '::1', '127.0.0.1'],
		);
	});

	test('marks every row as tcp', () => {
		assert.ok(ports.every(p => p.protocol === 'tcp'));
	});

	test('marks a missing USER column as unknown', () => {
		const [port] = parseLsofTable('node 5521 4u IPv4 0x1 0t0 TCP *:3000 (LISTEN)');
		assert.strictEqual(port.pid, 5521);
		assert.strictEqual(port.processName, 'node');
		assert.strictEqual(port.user, UNKNOWN_LABEL);
	});

	test('marks a missing COMMAND column as unknown', () => {
		const [port] = parseLsofTable('5521 varun 4u IPv4 0x1 0t0 TCP *:3000 (LISTEN)');
		assert.strictEqual(port.pid, 5521);
		assert.strictEqual(port.processName, UNKNOWN_LABEL);
		assert.strictEqual(port.user, 'varun');
	});

	test('ignores non-listening and unparsable rows', () => {
		const output = [
			'node 5521 varun 4u IPv4 0x1 0t0 TCP 127.0.0.1:3000->127.0.0.1:52000 (ESTABLISHED)',
			'node 5521 varun 4u IPv4 0x1 0t0 UDP *:5353',
			'garbage',
			'',
		].join('\n');
		assert.deepStrictEqual(parseLsofTable(output), []);
	});

	test('returns nothing for empty output', () => {
		assert.deepStrictEqual(parseLsofTable(''), []);
	});
});
