import { KeyValueStore } from './key-value-store';

export const MAX_LABEL_LENGTH = 40;
const STORAGE_KEY = 'portManager.labels';

export interface LabelSource {
	get(port: number): string | undefined;
}

export interface LabelWriter extends LabelSource {
	/** Sets the name, or removes it when `label` is undefined. */
	set(port: number, label: string | undefined): Promise<void>;
}

/** An error message if `input` is not a usable name; an empty name is fine, it removes the label. */
export function validateLabel(input: string): string | undefined {
	return input.trim().length > MAX_LABEL_LENGTH ? `Use ${MAX_LABEL_LENGTH} characters or fewer.` : undefined;
}

/** Tidies what the user typed; undefined means "no name". */
export function normalizeLabel(input: string): string | undefined {
	const tidy = input.trim().replace(/\s+/g, ' ');
	return tidy === '' ? undefined : tidy;
}

/** Names you give ports ("3000 = frontend"), kept per port number so they survive restarting the server. */
export class LabelStore implements LabelWriter {
	private readonly listeners = new Set<() => void>();

	constructor(private readonly store: KeyValueStore) {}

	get(port: number): string | undefined {
		const label = this.all()[String(port)];
		return typeof label === 'string' && label !== '' ? label : undefined;
	}

	async set(port: number, label: string | undefined): Promise<void> {
		const next = { ...this.all() };
		if (label === undefined) {
			delete next[String(port)];
		} else {
			next[String(port)] = label;
		}
		await this.store.update(STORAGE_KEY, next);
		this.listeners.forEach(listener => listener());
	}

	onDidChange(listener: () => void): { dispose(): void } {
		this.listeners.add(listener);
		return { dispose: () => void this.listeners.delete(listener) };
	}

	/** Stored data may be hand-edited or written by another version, so its shape is not trusted. */
	private all(): Record<string, unknown> {
		const stored = this.store.get<unknown>(STORAGE_KEY, {});
		return typeof stored === 'object' && stored !== null && !Array.isArray(stored) ? (stored as Record<string, unknown>) : {};
	}
}
