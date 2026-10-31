import * as assert from 'assert';
import { parseLsof } from '../../../features/ports/platform/parsers/lsof-parser';
import { parseLsofTable } from '../../../features/ports/platform/parsers/lsof-table-parser';
import { parseNetstat } from '../../../features/ports/platform/parsers/netstat-parser';
import { parsePowerShellPorts } from '../../../features/ports/platform/parsers/powershell-parser';
import { parseSs } from '../../../features/ports/platform/parsers/ss-parser';
import { dedupePorts, portListsEqual } from '../../../features/ports/service/port-list';
import { PortInfo } from '../../../features/ports/port-types';
import { linux, macos, windows } from '../../fixtures/load-fixtures';

function port(overrides: Partial<PortInfo> = {}): PortInfo {
	return {
		port: 3000,
		protocol: 'tcp',
		address: '127.0.0.1',
		pid: 100,
		processName: 'node',
		user: 'varun',
		...overrides,
	};
}

suite('dedupePorts', () => {
	test('merges the IPv4 and IPv6 rows of the same port and pid into one', () => {
		const result = dedupePorts([port({ address: '0.0.0.0' }), port({ address: '::' })]);
		assert.strictEqual(result.length, 1);
		assert.strictEqual(result[0].address, '0.0.0.0, ::');
	});

	test('gives the same address text whichever row comes first', () => {
		const forward = dedupePorts([port({ address: '::' }), port({ address: '0.0.0.0' })]);
		const backward = dedupePorts([port({ address: '0.0.0.0' }), port({ address: '::' })]);
		assert.deepStrictEqual(forward, backward);
	});

	test('does not repeat an address that appears twice', () => {
		const result = dedupePorts([port({ address: '::' }), port({ address: '::' })]);
		assert.strictEqual(result[0].address, '::');
	});

	test('keeps different pids on the same port as separate rows', () => {
		const result = dedupePorts([port({ pid: 1 }), port({ pid: 2 })]);
		assert.deepStrictEqual(result.map(p => p.pid), [1, 2]);
	});

	test('keeps different protocols on the same port as separate rows', () => {
		const result = dedupePorts([port({ protocol: 'udp' }), port({ protocol: 'tcp' })]);
		assert.deepStrictEqual(result.map(p => p.protocol), ['tcp', 'udp']);
	});

	test('merges rows with a hidden process on the same port', () => {
		const hidden = port({ pid: undefined, processName: 'unknown', user: 'unknown' });
		assert.strictEqual(dedupePorts([hidden, { ...hidden, address: '::' }]).length, 1);
	});

	test('fills in the command from whichever duplicate has it', () => {
		const result = dedupePorts([port(), port({ address: '::', command: 'node server.js' })]);
		assert.strictEqual(result[0].command, 'node server.js');
	});

	test('sorts by port, then by pid with hidden processes last', () => {
		const result = dedupePorts([
			port({ port: 80, pid: undefined }),
			port({ port: 80, pid: 7 }),
			port({ port: 22 }),
		]);
		assert.deepStrictEqual(result.map(p => [p.port, p.pid]), [[22, 100], [80, 7], [80, undefined]]);
	});

	test('does not modify its input', () => {
		const input = [port({ address: '0.0.0.0' }), port({ address: '::' })];
		dedupePorts(input);
		assert.strictEqual(input[0].address, '0.0.0.0');
	});

	test('returns an empty list for an empty list', () => {
		assert.deepStrictEqual(dedupePorts([]), []);
	});
});

suite('portListsEqual', () => {
	test('is true for equal contents in separate objects', () => {
		assert.ok(portListsEqual([port()], [port()]));
	});

	test('is false when length, any field or order differs', () => {
		assert.ok(!portListsEqual([port()], []));
		assert.ok(!portListsEqual([port()], [port({ pid: 101 })]));
		assert.ok(!portListsEqual([port()], [port({ command: 'x' })]));
		assert.ok(!portListsEqual([port({ port: 1 }), port({ port: 2 })], [port({ port: 2 }), port({ port: 1 })]));
	});
});

suite('dedupePorts on real captures', () => {
	const rows = (ports: PortInfo[]) => ports.map(p => [p.port, p.address, p.pid]);

	test('merges the IPv4 and IPv6 rows of a hidden process on the same port (53 and 631)', () => {
		const result = dedupePorts(parseSs(linux.ss));
		assert.strictEqual(result.length, 15);
		assert.strictEqual(result.find(p => p.port === 53)?.address, '127.0.0.53, 127.0.0.54');
		assert.strictEqual(result.find(p => p.port === 631)?.address, '127.0.0.1, ::1');
		assert.deepStrictEqual(result.filter(p => p.port === 631).map(p => p.pid), [undefined]);
	});

	test('keeps two processes that share a port as two rows', () => {
		const sharing = dedupePorts(parseSs(linux.ss)).filter(p => p.port === 18106);
		assert.deepStrictEqual(sharing.map(p => p.pid), [31368, 31375]);
	});

	test('gives one row per port for a process that holds several, in port order', () => {
		const helper = dedupePorts(parseSs(linux.ss)).filter(p => p.pid === 31368);
		assert.deepStrictEqual(helper.map(p => p.port), [18101, 18102, 18103, 18104, 18105, 18106]);
	});

	test('gives the same result whichever tool produced the rows', () => {
		const fromSs = rows(dedupePorts(parseSs(linux.ss)));
		const fromNetstat = rows(dedupePorts(parseNetstat(linux.netstat)));
		assert.deepStrictEqual(fromSs.map(r => [r[0], r[2]]), fromNetstat.map(r => [r[0], r[2]]));
	});

	test('leaves lsof output untouched, since it has no duplicates', () => {
		assert.strictEqual(dedupePorts(parseLsof(linux.lsofFields)).length, 13);
	});

	test('merges the IPv4 and IPv6 sockets of a macOS wildcard bind', () => {
		const result = dedupePorts(parseLsofTable(macos.lsofTable));
		assert.strictEqual(result.length, 8);
		assert.deepStrictEqual(result.filter(p => p.pid === 498).map(p => p.port), [5000, 7000]);
		assert.strictEqual(result.find(p => p.port === 49152)?.address, '*');
	});

	test('merges PowerShell rows of one process that listens on both address families', () => {
		const result = dedupePorts(parsePowerShellPorts(windows.powershellJson));
		assert.strictEqual(result.length, 4);
		assert.strictEqual(result.find(p => p.port === 135)?.address, '0.0.0.0, ::');
	});

	test('is idempotent: deduplicating twice changes nothing', () => {
		const once = dedupePorts(parseSs(linux.ss));
		assert.deepStrictEqual(dedupePorts(once), once);
	});
});
