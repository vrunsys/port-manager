import * as assert from 'assert';
import {
	describeHeader,
	filterPorts,
	isIdentified,
	isSortMode,
	rowLabel,
	rowMeta,
	rowTitle,
	scopePorts,
	sortName,
	sortPorts,
} from '../../../features/ports/view/port-list-model';
import { PortInfo } from '../../../features/ports/port-types';
import { LabelSource } from '../../../features/ports/view/port-labels';

function port(overrides: Partial<PortInfo> = {}): PortInfo {
	return { port: 3000, protocol: 'tcp', address: '127.0.0.1', pid: 100, processName: 'node', user: 'varun', ...overrides };
}

const hidden = port({ pid: undefined, processName: undefined, user: undefined });
const noNames: LabelSource = { get: () => undefined };
const names = (map: Record<number, string>): LabelSource => ({ get: port => map[port] });

suite('row text', () => {
	test('the title is the process name, or the name you gave the port', () => {
		assert.strictEqual(rowTitle(port(), undefined), 'node');
		assert.strictEqual(rowTitle(port(), 'zenitsu'), 'zenitsu');
	});

	test('a hidden process has no name to show', () => {
		assert.strictEqual(rowTitle(hidden, undefined), 'Unknown process');
		assert.strictEqual(rowTitle(hidden, 'database'), 'database');
	});

	test('the label puts the port first, then the title', () => {
		assert.strictEqual(rowLabel(port({ port: 5203 }), undefined), '5203  node');
		assert.strictEqual(rowLabel(port({ port: 5204 }), 'hellooajo'), '5204  hellooajo');
	});

	test('without a name the grey text shows where it listens, with the pid', () => {
		assert.strictEqual(rowMeta(port({ address: '127.0.0.1', pid: 27509 }), undefined), '127.0.0.1 · pid 27509');
		assert.strictEqual(rowMeta(port({ address: '*', pid: 27524 }), undefined), '* · pid 27524');
	});

	test('IPv6 addresses are shown in brackets', () => {
		assert.strictEqual(rowMeta(port({ address: '::1', pid: 27509 }), undefined), '[::1] · pid 27509');
		assert.strictEqual(rowMeta(port({ address: '0.0.0.0, ::', pid: 1 }), undefined), '0.0.0.0, [::] · pid 1');
	});

	test('with a name the grey text shows the process instead', () => {
		assert.strictEqual(rowMeta(port({ pid: 27510 }), 'hellooajo'), 'node · pid 27510');
	});

	test('a hidden process says so, with the address', () => {
		assert.strictEqual(rowMeta(hidden, undefined), '127.0.0.1 · process hidden');
		assert.strictEqual(rowMeta({ ...hidden, address: '::1' }, 'database'), '[::1] · process hidden');
	});
});

suite('filterPorts', () => {
	const ports = [
		port({ port: 3000, pid: 11, processName: 'node', command: 'node server.js' }),
		port({ port: 5432, pid: 22, processName: 'postgres', command: 'postgres -D /data', user: 'postgres' }),
		port({ port: 8080, pid: 33, processName: 'nginx', address: '::1' }),
		hidden,
	];
	const match = (query: string, labels: LabelSource = noNames) => filterPorts(ports, query, labels).map(p => p.port);

	test('an empty or blank search keeps everything, as a copy', () => {
		assert.deepStrictEqual(match(''), [3000, 5432, 8080, 3000]);
		assert.deepStrictEqual(match('   '), [3000, 5432, 8080, 3000]);
		assert.notStrictEqual(filterPorts(ports, '', noNames), ports);
	});

	test('finds by port number, process name and pid', () => {
		assert.deepStrictEqual(match('5432'), [5432]);
		assert.deepStrictEqual(match('nginx'), [8080]);
		assert.deepStrictEqual(match('33'), [8080]);
	});

	test('finds by address, command and user', () => {
		assert.deepStrictEqual(match('::1'), [8080]);
		assert.deepStrictEqual(match('/data'), [5432]);
		assert.deepStrictEqual(match('server.js'), [3000]);
	});

	test('ignores case', () => {
		assert.deepStrictEqual(match('NGINX'), [8080]);
	});

	test('every word must match, in any order', () => {
		assert.deepStrictEqual(match('node 3000'), [3000]);
		assert.deepStrictEqual(match('3000 node'), [3000]);
		assert.deepStrictEqual(match('node 5432'), []);
	});

	test('also searches the names you gave', () => {
		assert.deepStrictEqual(match('frontend', names({ 8080: 'Frontend' })), [8080]);
	});

	test('finds nothing for text that is nowhere', () => {
		assert.deepStrictEqual(match('zzz'), []);
	});
});

suite('sortPorts', () => {
	const a = port({ port: 8080, pid: 300, processName: 'nginx' });
	const b = port({ port: 3000, pid: 100, processName: 'node' });
	const c = port({ port: 5432, pid: 200, processName: 'Postgres' });
	const order = (ports: PortInfo[]) => ports.map(p => p.port);

	test('by port', () => {
		assert.deepStrictEqual(order(sortPorts([a, c, b], 'port', noNames)), [3000, 5432, 8080]);
	});

	test('by pid, with hidden processes last', () => {
		assert.deepStrictEqual(order(sortPorts([hidden, a, c, b], 'pid', noNames)), [3000, 5432, 8080, 3000]);
		assert.strictEqual(sortPorts([hidden, a], 'pid', noNames)[1], hidden);
	});

	test('by name, ignoring case, using the names you gave', () => {
		assert.deepStrictEqual(order(sortPorts([a, c, b], 'name', noNames)), [8080, 3000, 5432]);
		assert.deepStrictEqual(order(sortPorts([a, c, b], 'name', names({ 5432: 'aaa' }))), [5432, 8080, 3000]);
	});

	test('equal names fall back to the port', () => {
		const first = port({ port: 100, pid: 1 });
		const second = port({ port: 200, pid: 2 });
		assert.deepStrictEqual(order(sortPorts([second, first], 'name', noNames)), [100, 200]);
	});

	test('does not change the list it is given', () => {
		const input = [a, c, b];
		sortPorts(input, 'port', noNames);
		assert.deepStrictEqual(order(input), [8080, 5432, 3000]);
	});
});

suite('running only', () => {
	const known = port({ port: 3000, pid: 100 });
	const other = port({ port: 5432, pid: 200 });
	const ports = [known, hidden, other, { ...hidden, port: 631 }];

	test('a port is identified when its process can be seen', () => {
		assert.ok(isIdentified(known));
		assert.ok(!isIdentified(hidden));
	});

	test('everything is in scope unless running only is on, and the list is a copy', () => {
		assert.deepStrictEqual(scopePorts(ports, false), ports);
		assert.notStrictEqual(scopePorts(ports, false), ports);
	});

	test('running only leaves out the rows whose process is hidden, keeping the order', () => {
		assert.deepStrictEqual(scopePorts(ports, true), [known, other]);
	});

	test('running only on a list with nothing hidden changes nothing', () => {
		assert.deepStrictEqual(scopePorts([known, other], true), [known, other]);
	});

	test('running only on an empty list gives an empty list', () => {
		assert.deepStrictEqual(scopePorts([], true), []);
	});
});

suite('sort modes and the header', () => {
	test('names the sort orders for the title bar and header', () => {
		assert.deepStrictEqual(['port', 'pid', 'name'].map(mode => sortName(mode as 'port')), ['Port', 'PID', 'Name']);
	});

	test('recognises only real sort orders, for stored values', () => {
		assert.ok(isSortMode('pid'));
		assert.ok(!isSortMode('size') && !isSortMode(undefined) && !isSortMode(3));
	});

	test('the header shows the count and the sort order', () => {
		assert.strictEqual(describeHeader(8, 8, 'pid'), '8 running · Sort: PID');
	});

	test('the header counts the rows that running only tucked away', () => {
		assert.strictEqual(describeHeader(5, 5, 'port', 3), '5 running · 3 hidden · Sort: Port');
		assert.strictEqual(describeHeader(0, 0, 'port', 2), '0 running · 2 hidden · Sort: Port');
		assert.strictEqual(describeHeader(5, 2, 'pid', 1), '2 of 5 · 1 hidden · Sort: PID');
	});

	test('while searching, the header shows how many match', () => {
		assert.strictEqual(describeHeader(8, 3, 'port'), '3 of 8 · Sort: Port');
		assert.strictEqual(describeHeader(8, 0, 'name'), '0 of 8 · Sort: Name');
	});
});
