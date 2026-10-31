import { errorMessage } from '../../../shared/error-message';
import { PortListingError, PortsErrorKind } from '../port-types';

/** What the UI shows when listing ports fails. */
export interface PortsError {
	kind: PortsErrorKind;
	message: string;
}

/** Adapters throw PortListingError with the kind already worked out; anything else is an unexpected failure. */
export function toPortsError(error: unknown): PortsError {
	return error instanceof PortListingError
		? { kind: error.kind, message: error.message }
		: { kind: 'unknown', message: errorMessage(error) };
}
