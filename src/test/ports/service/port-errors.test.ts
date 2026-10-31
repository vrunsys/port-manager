import * as assert from 'assert';
import { PortListingError } from '../../../features/ports/port-types';
import { toPortsError } from '../../../features/ports/service/port-errors';

suite('toPortsError', () => {
	test('reads the kind an adapter already decided', () => {
		for (const kind of ['tool-missing', 'permission-denied', 'timeout', 'unknown'] as const) {
			assert.deepStrictEqual(toPortsError(new PortListingError('some text', kind)), { kind, message: 'some text' });
		}
	});

	test('does not guess a kind from the text of other errors', () => {
		assert.deepStrictEqual(toPortsError(new Error('Permission denied')), { kind: 'unknown', message: 'Permission denied' });
	});

	test('falls back to unknown and keeps the message of anything else', () => {
		assert.deepStrictEqual(toPortsError(new Error('boom')), { kind: 'unknown', message: 'boom' });
		assert.deepStrictEqual(toPortsError('text'), { kind: 'unknown', message: 'text' });
	});
});
