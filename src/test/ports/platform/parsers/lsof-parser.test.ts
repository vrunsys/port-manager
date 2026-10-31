import * as assert from 'assert';
import { parseLsof } from '../../../../features/ports/platform/parsers/lsof-parser';
import { HELPER, HELPER_PEER } from '../../../fixtures/linux-capture';
import { linux } from '../../../fixtures/load-fixtures';
import { brief } from '../../../helpers/rows';

suite('parseLsof (real `lsof -F pcLn` capture)', () => {
	const ports = parseLsof(linux.lsofFields);

	test('returns one row per listening address with the owner details', () => {
		assert.deepStrictEqual(brief(ports), [
			[1716, '*', 1691, 'kdeconnectd'],
			[5054, '127.0.0.1', 1695, 'ulauncher'],
			[43623, '127.0.0.1', 8146, 'code'],
			[34331, '127.0.0.1', 8227, 'code'],
			[20855, '127.0.0.1', 8227, 'code'],
			[45949, '127.0.0.1', 9374, 'code'],
			[18104, '*', HELPER, 'MainThread'],
			[18101, '127.0.0.1', HELPER, 'MainThread'],
			[18102, '*', HELPER, 'MainThread'],
			[18103, '::1', HELPER, 'MainThread'],
			[18105, '*', HELPER, 'MainThread'],
			[18106, '*', HELPER, 'MainThread'],
			[18106, '*', HELPER_PEER, 'MainThread'],
		]);
	});

	test('reports the login name of each owner', () => {
		assert.ok(ports.every(p => p.user === 'dev'));
	});

	test('never lists other users\' sockets (so ports 53 and 631 are absent)', () => {
		assert.deepStrictEqual(ports.filter(p => p.port === 53 || p.port === 631), []);
	});

	test('returns nothing for empty output', () => {
		assert.deepStrictEqual(parseLsof(''), []);
	});
});
