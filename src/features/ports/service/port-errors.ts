import { CommandError } from '../../../shared/run-command';

export type PortsErrorKind = 'tool-missing' | 'permission-denied' | 'timeout' | 'unknown';

/** What the UI shows when listing ports fails. */
export interface PortsError {
	kind: PortsErrorKind;
	message: string;
}

/** For failures an adapter already understands, so they need no guessing from text. */
export class PortListingError extends Error {
	constructor(
		message: string,
		readonly kind: PortsErrorKind,
	) {
		super(message);
		this.name = 'PortListingError';
	}
}

// Tools print these in English, or as errno names, regardless of the OS language settings.
const PERMISSION_PATTERN = /permission denied|operation not permitted|access is denied|EACCES|EPERM/i;

export function toPortsError(error: unknown): PortsError {
	const message = error instanceof Error ? error.message : String(error);
	if (error instanceof PortListingError) {
		return { kind: error.kind, message };
	}
	if (error instanceof CommandError) {
		if (error.failure === 'not-found') {
			return { kind: 'tool-missing', message };
		}
		if (error.failure === 'timeout') {
			return { kind: 'timeout', message };
		}
		if (PERMISSION_PATTERN.test(`${message} ${error.stderr}`)) {
			return { kind: 'permission-denied', message };
		}
	} else if (PERMISSION_PATTERN.test(message)) {
		return { kind: 'permission-denied', message };
	}
	return { kind: 'unknown', message };
}
