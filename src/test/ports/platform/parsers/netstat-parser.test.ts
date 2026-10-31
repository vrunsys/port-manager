import * as assert from 'assert';
import { parseNetstat } from '../../../../features/ports/platform/parsers/netstat-parser';
import { UNKNOWN_LABEL } from '../../../../features/ports/port-types';
import { HELPER, HELPER_PEER } from '../../../fixtures/linux-capture';
import { linux } from '../../../fixtures/load-fixtures';
import { brief } from '../../../helpers/rows';

suite('parseNetstat (real `netstat -tlnp` capture)', () => {
	const ports = parseNetstat(linux.netstat);

	test('skips both header lines and parses every tcp and tcp6 row', () => {
		assert.deepStrictEqual(brief(ports), [
			[5054, '127.0.0.1', 1695, 'python3'],
			[45949, '127.0.0.1', 9374, 'code'],
			[20855, '127.0.0.1', 8227, 'Code --standar'],
			[53, '127.0.0.53', undefined, UNKNOWN_LABEL],
			[53, '127.0.0.54', undefined, UNKNOWN_LABEL],
			[18102, '0.0.0.0', HELPER, 'node'],
			[18106, '0.0.0.0', HELPER_PEER, 'node'],
			[18106, '0.0.0.0', HELPER, 'node'],
			[631, '127.0.0.1', undefined, UNKNOWN_LABEL],
			[18101, '127.0.0.1', HELPER, 'node'],
			[34331, '127.0.0.1', 8227, 'Code --standar'],
			[43623, '127.0.0.1', 8146, 'Code --standar'],
			[1716, '::', 1691, 'kdeconnectd'],
			[18105, '::', HELPER, 'node'],
			[18104, '::', HELPER, 'node'],
			[18103, '::1', HELPER, 'node'],
			[631, '::1', undefined, UNKNOWN_LABEL],
		]);
	});

	test('keeps program names that contain spaces', () => {
		assert.ok(ports.some(p => p.processName === 'Code --standar'));
	});

	test('marks a "-" process column as unknown', () => {
		const hidden = ports.filter(p => p.pid === undefined);
		assert.deepStrictEqual(hidden.map(p => p.port), [53, 53, 631, 631]);
	});

	test('returns nothing for empty output', () => {
		assert.deepStrictEqual(parseNetstat(''), []);
	});
});
