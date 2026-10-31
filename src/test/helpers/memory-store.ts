import { KeyValueStore } from '../../features/ports/view/key-value-store';

/** An in-memory stand-in for VS Code's globalState. */
export function memoryStore(initial: Record<string, unknown> = {}): KeyValueStore & { data: Record<string, unknown> } {
	const data = { ...initial };
	return {
		data,
		get: <T>(key: string, fallback: T) => (key in data ? (data[key] as T) : fallback),
		update: async (key, value) => void (data[key] = value),
	};
}
