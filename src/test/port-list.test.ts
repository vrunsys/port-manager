import * as assert from 'assert';
import { dedupePorts, portListsEqual } from '../features/ports/port-list';
import { PortInfo } from '../features/ports/port-types';

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
