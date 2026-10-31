import * as assert from 'assert';
import { PortListingError, toPortsError } from '../../../features/ports/service/port-errors';
import { CommandError } from '../../../shared/run-command';

suite('toPortsError', () => {
	test('maps a missing program to tool-missing', () => {
		const error = new CommandError('"ss" is not installed or not on PATH.', 'not-found', '', '');
		assert.strictEqual(toPortsError(error).kind, 'tool-missing');
	});

	test('maps a timeout to timeout', () => {
		assert.strictEqual(toPortsError(new CommandError('too slow', 'timeout', '', '')).kind, 'timeout');
	});

	test('maps permission text on stderr to permission-denied', () => {
		const error = new CommandError('"netstat" failed', 'failed', '', 'Operation not permitted');
		assert.strictEqual(toPortsError(error).kind, 'permission-denied');
	});

	test('maps permission text in a plain error to permission-denied', () => {
		assert.strictEqual(toPortsError(new Error('EACCES: denied')).kind, 'permission-denied');
	});

	test('trusts the kind of an adapter-provided error', () => {
		const error = new PortListingError('none installed', 'tool-missing');
		assert.deepStrictEqual(toPortsError(error), { kind: 'tool-missing', message: 'none installed' });
	});

	test('falls back to unknown and keeps the message', () => {
		assert.deepStrictEqual(toPortsError(new Error('boom')), { kind: 'unknown', message: 'boom' });
		assert.deepStrictEqual(toPortsError('text'), { kind: 'unknown', message: 'text' });
	});
});
