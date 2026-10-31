import { Emitter } from '../../../shared/emitter';
import { KeyValueStore } from './key-value-store';
import { DEFAULT_SORT, isSortMode, SortMode } from './port-list-model';

const SORT_KEY = 'portManager.sort';
const RUNNING_ONLY_KEY = 'portManager.runningOnly';

/** What the list is narrowed and ordered by. The sort order and "running only" are remembered; the search is not. */
export class ViewOptions {
	private currentQuery = '';
	private currentSort: SortMode;
	private currentRunningOnly: boolean;
	private readonly changes = new Emitter();

	constructor(private readonly store: KeyValueStore) {
		const saved = store.get<unknown>(SORT_KEY, DEFAULT_SORT);
		this.currentSort = isSortMode(saved) ? saved : DEFAULT_SORT;
		this.currentRunningOnly = store.get<unknown>(RUNNING_ONLY_KEY, false) === true;
	}

	get query(): string {
		return this.currentQuery;
	}

	get sort(): SortMode {
		return this.currentSort;
	}

	/** True when rows whose process is hidden are left out of the list. */
	get runningOnly(): boolean {
		return this.currentRunningOnly;
	}

	setQuery(query: string): void {
		if (query !== this.currentQuery) {
			this.currentQuery = query;
			this.notify();
		}
	}

	async setSort(sort: SortMode): Promise<void> {
		if (sort !== this.currentSort) {
			this.currentSort = sort;
			await this.store.update(SORT_KEY, sort);
			this.notify();
		}
	}

	async setRunningOnly(runningOnly: boolean): Promise<void> {
		if (runningOnly !== this.currentRunningOnly) {
			this.currentRunningOnly = runningOnly;
			await this.store.update(RUNNING_ONLY_KEY, runningOnly);
			this.notify();
		}
	}

	onDidChange(listener: () => void): { dispose(): void } {
		return this.changes.listen(listener);
	}

	private notify(): void {
		this.changes.fire();
	}
}
