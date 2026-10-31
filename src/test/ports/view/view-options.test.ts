import * as assert from 'assert';
import { KeyValueStore } from '../../../features/ports/view/key-value-store';
import { ViewOptions } from '../../../features/ports/view/view-options';

function memoryStore(initial: Record<string, unknown> = {}): KeyValueStore & { data: Record<string, unknown> } {
	const data = { ...initial };
	return {
		data,
		get: <T>(key: string, fallback: T) => (key in data ? (data[key] as T) : fallback),
		update: async (key, value) => void (data[key] = value),
	};
}

suite('ViewOptions', () => {
	test('starts with no search, the port order, and every port shown', () => {
		const options = new ViewOptions(memoryStore());
		assert.strictEqual(options.query, '');
		assert.strictEqual(options.sort, 'port');
		assert.strictEqual(options.runningOnly, false);
	});

	test('tells listeners when the search or the order changes, and not when nothing changes', async () => {
		const options = new ViewOptions(memoryStore());
		let changes = 0;
		options.onDidChange(() => changes++);
		options.setQuery('node');
		options.setQuery('node');
		await options.setSort('pid');
		await options.setSort('pid');
		assert.strictEqual(changes, 2);
	});

	test('remembers the sort order for next time', async () => {
		const storage = memoryStore();
		await new ViewOptions(storage).setSort('name');
		assert.strictEqual(new ViewOptions(storage).sort, 'name');
	});

	test('does not remember the search', () => {
		const storage = memoryStore();
		new ViewOptions(storage).setQuery('node');
		assert.strictEqual(new ViewOptions(storage).query, '');
	});

	test('falls back to the port order when the stored value is not a sort order', () => {
		for (const stored of ['size', 7, null, {}]) {
			assert.strictEqual(new ViewOptions(memoryStore({ 'portManager.sort': stored })).sort, 'port', JSON.stringify(stored));
		}
	});

	test('tells listeners when running only is switched, and not when it stays the same', async () => {
		const options = new ViewOptions(memoryStore());
		let changes = 0;
		options.onDidChange(() => changes++);
		await options.setRunningOnly(true);
		await options.setRunningOnly(true);
		await options.setRunningOnly(false);
		assert.strictEqual(changes, 2);
		assert.strictEqual(options.runningOnly, false);
	});

	test('remembers running only for next time', async () => {
		const storage = memoryStore();
		await new ViewOptions(storage).setRunningOnly(true);
		assert.strictEqual(new ViewOptions(storage).runningOnly, true);
	});

	test('treats a stored value that is not exactly true as off', () => {
		for (const stored of ['yes', 1, null, {}, 'true']) {
			assert.strictEqual(new ViewOptions(memoryStore({ 'portManager.runningOnly': stored })).runningOnly, false, JSON.stringify(stored));
		}
	});

	test('stops notifying a disposed listener', async () => {
		const options = new ViewOptions(memoryStore());
		let changes = 0;
		options.onDidChange(() => changes++).dispose();
		options.setQuery('x');
		assert.strictEqual(changes, 0);
	});
});
