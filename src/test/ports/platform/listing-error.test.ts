import * as assert from 'assert';
import { asListingError, withListingErrors } from '../../../features/ports/platform/listing-error';
import { PortListingError } from '../../../features/ports/port-types';
import { CommandError } from '../../../shared/run-command';

suite('asListingError', () => {
	test('maps a missing program to tool-missing', () => {
		const error = new CommandError('"ss" is not installed or not on PATH.', 'not-found', '', '');
		assert.strictEqual(asListingError(error).kind, 'tool-missing');
	});

	test('maps a timeout to timeout', () => {
		assert.strictEqual(asListingError(new CommandError('too slow', 'timeout', '', '')).kind, 'timeout');
	});

	test('maps permission text on stderr to permission-denied', () => {
		const error = new CommandError('"netstat" failed', 'failed', '', 'Operation not permitted');
		assert.strictEqual(asListingError(error).kind, 'permission-denied');
	});

	test('recognises the Windows signs of a refusal that are not English words', () => {
		for (const text of ['0x80070005', 'System.UnauthorizedAccessException: Access to the path']) {
			assert.strictEqual(asListingError(new CommandError('failed', 'failed', '', text)).kind, 'permission-denied', text);
		}
	});

	test('maps permission text in a plain error to permission-denied', () => {
		assert.strictEqual(asListingError(new Error('EACCES: denied')).kind, 'permission-denied');
	});

	test('keeps the message, and falls back to unknown', () => {
		const error = asListingError(new CommandError('"ss" failed: boom', 'failed', '', 'boom'));
		assert.deepStrictEqual([error.kind, error.message], ['unknown', '"ss" failed: boom']);
		assert.strictEqual(asListingError('text').kind, 'unknown');
	});

	test('returns an error that is already typed unchanged', () => {
		const typed = new PortListingError('none installed', 'tool-missing');
		assert.strictEqual(asListingError(typed), typed);
	});
});

suite('withListingErrors', () => {
	test('passes the result through', async () => {
		assert.strictEqual(await withListingErrors(async () => 42), 42);
	});

	test('rethrows whatever failed as a typed error', async () => {
		await assert.rejects(
			withListingErrors(async () => {
				throw new CommandError('gone', 'not-found', '', '');
			}),
			(error: unknown) => error instanceof PortListingError && error.kind === 'tool-missing',
		);
	});
});
