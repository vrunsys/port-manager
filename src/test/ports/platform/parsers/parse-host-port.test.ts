import * as assert from 'assert';
import { parseHostPort } from '../../../../features/ports/platform/parsers/parse-host-port';

suite('parseHostPort', () => {
	test('handles IPv4, bracketed IPv6, bare IPv6 and wildcard hosts', () => {
		assert.deepStrictEqual(parseHostPort('127.0.0.1:631'), { address: '127.0.0.1', port: 631 });
		assert.deepStrictEqual(parseHostPort('[::1]:631'), { address: '::1', port: 631 });
		assert.deepStrictEqual(parseHostPort(':::22'), { address: '::', port: 22 });
		assert.deepStrictEqual(parseHostPort('::1:18103'), { address: '::1', port: 18103 });
		assert.deepStrictEqual(parseHostPort('*:3000'), { address: '*', port: 3000 });
	});

	test('drops the interface suffix', () => {
		assert.deepStrictEqual(parseHostPort('127.0.0.53%lo:53'), { address: '127.0.0.53', port: 53 });
	});

	test('rejects text without a valid port', () => {
		assert.strictEqual(parseHostPort('*:*'), undefined);
		assert.strictEqual(parseHostPort('localhost'), undefined);
		assert.strictEqual(parseHostPort('0.0.0.0:70000'), undefined);
		assert.strictEqual(parseHostPort('0.0.0.0:0'), undefined);
	});
});
