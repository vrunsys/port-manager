import { CommandError } from '../../../shared/run-command';
import { errorMessage } from '../../../shared/error-message';
import { PortListingError } from '../port-types';

// On macOS and Linux messages are forced to English (see englishMessagesEnvironment). On Windows the text
// is localized, so a permission failure there may be reported as "unknown" unless it carries an HRESULT.
const PERMISSION_PATTERN = /permission denied|operation not permitted|access is denied|unauthorizedaccess|0x80070005|EACCES|EPERM/i;

/** Turns whatever a listing attempt threw into the typed error the service and the UI understand. */
export function asListingError(error: unknown): PortListingError {
	if (error instanceof PortListingError) {
		return error;
	}
	const message = errorMessage(error);
	if (error instanceof CommandError) {
		if (error.failure === 'not-found') {
			return new PortListingError(message, 'tool-missing');
		}
		if (error.failure === 'timeout') {
			return new PortListingError(message, 'timeout');
		}
		return new PortListingError(message, PERMISSION_PATTERN.test(`${message} ${error.stderr}`) ? 'permission-denied' : 'unknown');
	}
	return new PortListingError(message, PERMISSION_PATTERN.test(message) ? 'permission-denied' : 'unknown');
}

export async function withListingErrors<T>(task: () => Promise<T>): Promise<T> {
	try {
		return await task();
	} catch (error) {
		throw asListingError(error);
	}
}
