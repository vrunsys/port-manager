import * as assert from 'assert';
import { parseHostPort } from '../features/ports/parsers/parse-host-port';
import { parseLsof } from '../features/ports/parsers/lsof-parser';
import { parseNetstat } from '../features/ports/parsers/netstat-parser';
import { parsePs } from '../features/ports/parsers/ps-parser';
import { parseSs } from '../features/ports/parsers/ss-parser';
import { UNKNOWN_LABEL } from '../features/ports/port-types';
import { LSOF_OUTPUT, NETSTAT_OUTPUT, PS_OUTPUT, SS_OUTPUT } from './fixtures/port-tool-output';

suite('parseHostPort', () => {
	test('handles IPv4, bracketed IPv6, bare IPv6 and wildcard hosts', () => {
		assert.deepStrictEqual(parseHostPort('127.0.0.1:631'), { address: '127.0.0.1', port: 631 });
		assert.deepStrictEqual(parseHostPort('[::1]:631'), { address: '::1', port: 631 });
		assert.deepStrictEqual(parseHostPort(':::22'), { address: '::', port: 22 });
		assert.deepStrictEqual(parseHostPort('*:3000'), { address: '*', port: 3000 });
	});

	test('drops the interface suffix', () => {
		assert.deepStrictEqual(parseHostPort('127.0.0.53%lo:53'), { address: '127.0.0.53', port: 53 });
	});

	test('rejects text without a valid port', () => {
		assert.strictEqual(parseHostPort('*:*'), undefined);
		assert.strictEqual(parseHostPort('localhost'), undefined);
		assert.strictEqual(parseHostPort('0.0.0.0:70000'), undefined);
	});
});

suite('parseSs', () => {
	const ports = parseSs(SS_OUTPUT);

	test('skips the header and returns one row per listening process', () => {
		assert.deepStrictEqual(
			ports.map(p => [p.port, p.pid]),
			[[53, 612], [22, 801], [3000, 4242], [5432, undefined], [22, 801], [80, 900], [80, 901]],
		);
	});

	test('reads address and process name', () => {
		assert.strictEqual(ports[0].address, '127.0.0.53');
		assert.strictEqual(ports[0].processName, 'systemd-resolve');
		assert.strictEqual(ports[4].address, '::');
	});

	test('marks a row with hidden process info as unknown instead of failing', () => {
		const hidden = ports[3];
		assert.strictEqual(hidden.port, 5432);
		assert.strictEqual(hidden.pid, undefined);
		assert.strictEqual(hidden.processName, UNKNOWN_LABEL);
	});

	test('returns nothing for empty output', () => {
		assert.deepStrictEqual(parseSs(''), []);
	});
});

suite('parseLsof', () => {
	const ports = parseLsof(LSOF_OUTPUT);

	test('returns one row per address with the owner details', () => {
		assert.deepStrictEqual(
			ports.map(p => [p.port, p.address, p.pid, p.processName, p.user]),
			[
				[53, '127.0.0.53', 612, 'systemd-resolve', 'systemd-resolve'],
				[3000, '*', 4242, 'node', 'varun'],
				[3000, '::1', 4242, 'node', 'varun'],
			],
		);
	});

	test('returns nothing for empty output', () => {
		assert.deepStrictEqual(parseLsof(''), []);
	});
});

suite('parseNetstat', () => {
	const ports = parseNetstat(NETSTAT_OUTPUT);

	test('skips the headers and parses every listening row', () => {
		assert.deepStrictEqual(
			ports.map(p => [p.port, p.address, p.pid]),
			[[53, '127.0.0.53', 612], [22, '0.0.0.0', undefined], [9222, '127.0.0.1', 2001], [22, '::', undefined]],
		);
	});

	test('keeps program names that contain spaces', () => {
		assert.strictEqual(ports[2].processName, 'Web Content');
	});

	test('marks a "-" process column as unknown', () => {
		assert.strictEqual(ports[1].pid, undefined);
		assert.strictEqual(ports[1].processName, UNKNOWN_LABEL);
	});
});

suite('parsePs', () => {
	test('maps pid to user and full command line', () => {
		const details = parsePs(PS_OUTPUT);
		assert.deepStrictEqual(details.get(4242), { user: 'varun', command: 'node server.js --port 3000' });
		assert.strictEqual(details.get(801)?.command, 'sshd: /usr/sbin/sshd -D');
	});
});
