import * as assert from 'assert';
import { failed, fromSignalError, killed, notFound, permissionDenied } from '../../../features/ports/kill/kill-results';

const errno = (code: string, message = code) => Object.assign(new Error(message), { code });

suite('kill result mapping', () => {
	test('maps ESRCH (no such process) to not-found', () => {
		assert.deepStrictEqual(fromSignalError(errno('ESRCH'), 42), notFound(42));
		assert.strictEqual(notFound(42).status, 'not-found');
	});

	test('maps EPERM (not allowed to signal it) to permission-denied', () => {
		assert.deepStrictEqual(fromSignalError(errno('EPERM'), 42), permissionDenied(42));
		assert.strictEqual(permissionDenied(42).status, 'permission-denied');
	});

	test('maps any other errno to failed and keeps the reason', () => {
		const result = fromSignalError(errno('EINVAL', 'invalid signal'), 42);
		assert.strictEqual(result.status, 'failed');
		assert.match(result.message, /Could not stop process 42: invalid signal/);
	});

	test('maps an error without a code, or a thrown string, to failed', () => {
		assert.strictEqual(fromSignalError(new Error('boom'), 42).status, 'failed');
		const result = fromSignalError('plain text', 42);
		assert.strictEqual(result.status, 'failed');
		assert.match(result.message, /plain text/);
	});

	test('every outcome has a message the user can read, naming the process', () => {
		for (const result of [killed(42), notFound(42), permissionDenied(42)]) {
			assert.match(result.message, /42/);
		}
		assert.strictEqual(killed(42).status, 'killed');
		assert.deepStrictEqual(failed('nope'), { status: 'failed', message: 'nope' });
	});

	test('the permission message points at the likely cause', () => {
		assert.match(permissionDenied(42).message, /another user/);
	});
});
