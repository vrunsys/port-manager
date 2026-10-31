/** The part of vscode.Memento that is needed, so stored settings can be tested without VS Code. */
export interface KeyValueStore {
	get<T>(key: string, fallback: T): T;
	update(key: string, value: unknown): Thenable<void>;
}
