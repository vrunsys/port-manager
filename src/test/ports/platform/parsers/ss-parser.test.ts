import * as assert from 'assert';
import { parseSs } from '../../../../features/ports/platform/parsers/ss-parser';
import { HELPER, HELPER_PEER } from '../../../fixtures/linux-capture';
import { linux } from '../../../fixtures/load-fixtures';
import { brief } from '../../../helpers/rows';

suite('parseSs (real `ss -ltnp` capture)', () => {
	const ports = parseSs(linux.ss);

	test('skips the header and returns every listening row', () => {
		assert.deepStrictEqual(brief(ports), [
			[5054, '127.0.0.1', 1695, 'ulauncher'],
			[45949, '127.0.0.1', 9374, 'code'],
			[20855, '127.0.0.1', 8227, 'code'],
			[53, '127.0.0.53', undefined, undefined],
			[53, '127.0.0.54', undefined, undefined],
			[18102, '0.0.0.0', HELPER, 'MainThread'],
			[18106, '0.0.0.0', HELPER_PEER, 'MainThread'],
			[18106, '0.0.0.0', HELPER, 'MainThread'],
			[631, '127.0.0.1', undefined, undefined],
			[18101, '127.0.0.1', HELPER, 'MainThread'],
			[34331, '127.0.0.1', 8227, 'code'],
			[43623, '127.0.0.1', 8146, 'code'],
			[1716, '*', 1691, 'kdeconnectd'],
			[18105, '::', HELPER, 'MainThread'],
			[18104, '*', HELPER, 'MainThread'],
			[18103, '::1', HELPER, 'MainThread'],
			[631, '::1', undefined, undefined],
		]);
	});

	test('reads IPv4, IPv6 and wildcard binds', () => {
		const addressOf = (port: number) => ports.find(p => p.port === port)?.address;
		assert.strictEqual(addressOf(18101), '127.0.0.1');
		assert.strictEqual(addressOf(18102), '0.0.0.0');
		assert.strictEqual(addressOf(18103), '::1');
		assert.strictEqual(addressOf(18104), '*');
		assert.strictEqual(addressOf(18105), '::');
	});

	test('returns every listener of a process that holds several ports', () => {
		const mine = ports.filter(p => p.pid === HELPER).map(p => p.port).sort();
		assert.deepStrictEqual(mine, [18101, 18102, 18103, 18104, 18105, 18106]);
	});

	test('returns both processes that share one port', () => {
		const sharing = ports.filter(p => p.port === 18106).map(p => p.pid).sort();
		assert.deepStrictEqual(sharing, [HELPER_PEER, HELPER].sort());
	});

	test('marks rows with hidden process info as unknown instead of failing', () => {
		const hidden = ports.filter(p => p.pid === undefined);
		assert.deepStrictEqual(hidden.map(p => p.port), [53, 53, 631, 631]);
		assert.ok(hidden.every(p => p.processName === undefined && p.user === undefined));
	});

	test('strips the interface suffix of 127.0.0.53%lo', () => {
		assert.strictEqual(ports.find(p => p.address.startsWith('127.0.0.53'))?.address, '127.0.0.53');
	});

	test('returns one row per process of a forked server (synthetic row)', () => {
		const row = 'LISTEN 0 511 0.0.0.0:80 0.0.0.0:* users:(("nginx",pid=900,fd=6),("nginx",pid=901,fd=6))';
		assert.deepStrictEqual(parseSs(row).map(p => p.pid), [900, 901]);
	});

	test('returns nothing for empty output', () => {
		assert.deepStrictEqual(parseSs(''), []);
	});
});
