import { errorMessage } from './error-message';
import { logger } from './logger';

/** A small event source: one failing listener never stops the others, and the failure is logged. */
export class Emitter<T = void> {
	private readonly listeners = new Set<(value: T) => void>();

	listen(listener: (value: T) => void): { dispose(): void } {
		this.listeners.add(listener);
		return { dispose: () => void this.listeners.delete(listener) };
	}

	fire(...args: T extends void ? [] : [value: T]): void {
		for (const listener of [...this.listeners]) {
			try {
				listener(args[0] as T);
			} catch (error) {
				logger.error(`A change listener threw: ${errorMessage(error)}`);
			}
		}
	}

	clear(): void {
		this.listeners.clear();
	}
}
