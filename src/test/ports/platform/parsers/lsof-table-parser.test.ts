import * as assert from 'assert';
import { parseLsofTable } from '../../../../features/ports/platform/parsers/lsof-table-parser';
import { PortInfo, UNKNOWN_LABEL } from '../../../../features/ports/port-types';
import { linux, macos } from '../../../fixtures/load-fixtures';

const brief = (ports: PortInfo[]) => ports.map(p => [p.port, p.address, p.pid, p.processName, p.user]);

suite('parseLsofTable (macOS-format sample)', () => {
	const ports = parseLsofTable(macos.lsofTable);

	test('returns port, address, pid, process and user for every row, skipping the header', () => {
		assert.deepStrictEqual(brief(ports), [
			[22, '*', 1, 'launchd', 'root'],
			[49152, '*', 412, 'rapportd', 'varun'],
			[49152, '*', 412, 'rapportd', 'varun'],
			[7000, '*', 498, 'ControlCe', 'varun'],
			[7000, '*', 498, 'ControlCe', 'varun'],
			[5000, '*', 498, 'ControlCe', 'varun'],
			[5000, '*', 498, 'ControlCe', 'varun'],
			[9222, '127.0.0.1', 1203, 'Google Chrome', 'varun'],
			[3000, '::1', 5521, 'node', 'varun'],
			[3001, '127.0.0.1', 5521, 'node', 'varun'],
			[5432, '127.0.0.1', 7788, 'postgres', '_postgres'],
		]);
	});

	test('reports the IPv4 and IPv6 socket of a wildcard bind as two rows for the service to merge', () => {
		assert.strictEqual(ports.filter(p => p.port === 49152).length, 2);
	});

	test('returns every listener of a process with several ports', () => {
		assert.deepStrictEqual(ports.filter(p => p.pid === 5521).map(p => p.port).sort(), [3000, 3001]);
		assert.deepStrictEqual([...new Set(ports.filter(p => p.pid === 498).map(p => p.port))].sort(), [5000, 7000]);
	});

	test('unescapes spaces in command names', () => {
		assert.ok(ports.some(p => p.processName === 'Google Chrome'));
	});

	test('marks every row as tcp', () => {
		assert.ok(ports.every(p => p.protocol === 'tcp'));
	});
});

suite('parseLsofTable (real Linux capture of the same command)', () => {
	test('parses the identical table layout, including a wildcard IPv6 bind', () => {
		const ports = parseLsofTable(linux.lsofTable);
		assert.strictEqual(ports.length, 13);
		assert.deepStrictEqual(brief(ports).slice(0, 3), [
			[1716, '*', 1691, 'kdeconnec', 'dev'],
			[5054, '127.0.0.1', 1695, 'ulauncher', 'dev'],
			[43623, '127.0.0.1', 8146, 'code', 'dev'],
		]);
		assert.deepStrictEqual(ports.find(p => p.port === 18103)?.address, '::1');
	});

	test('keeps the 9-character truncation lsof applies to names', () => {
		const names = new Set(parseLsofTable(linux.lsofTable).map(p => p.processName));
		assert.ok(names.has('MainThrea') && names.has('kdeconnec'));
	});

	test('returns both processes that share one port', () => {
		const sharing = parseLsofTable(linux.lsofTable).filter(p => p.port === 18106).map(p => p.pid);
		assert.deepStrictEqual(sharing.sort(), [31368, 31375]);
	});
});

suite('parseLsofTable (edge cases)', () => {
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

	test('ignores non-listening, UDP and unparsable rows', () => {
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
