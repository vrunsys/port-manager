import * as assert from 'assert';
import { DarwinAdapter } from '../features/ports/darwin/darwin-adapter';
import { LinuxAdapter } from '../features/ports/linux/linux-adapter';
import { createPlatformAdapter } from '../features/ports/platform-adapter-factory';

suite('createPlatformAdapter', () => {
	test('returns the Linux adapter for linux', () => {
		assert.ok(createPlatformAdapter('linux') instanceof LinuxAdapter);
	});

	test('returns the macOS adapter for darwin', () => {
		assert.ok(createPlatformAdapter('darwin') instanceof DarwinAdapter);
	});

	test('rejects a platform without an adapter', () => {
		assert.throws(() => createPlatformAdapter('aix'), /does not support "aix"/);
	});
});
