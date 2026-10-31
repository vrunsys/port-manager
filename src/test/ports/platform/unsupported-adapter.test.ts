import * as assert from 'assert';
import { UnsupportedAdapter } from '../../../features/ports/platform/unsupported-adapter';

suite('UnsupportedAdapter', () => {
	test('reports why listing is impossible', async () => {
		const adapter = new UnsupportedAdapter(new Error('Port Manager does not support "aix" yet.'));
		await assert.rejects(adapter.listPorts(), /does not support "aix"/);
		assert.strictEqual((await adapter.killProcess()).status, 'failed');
	});
});
