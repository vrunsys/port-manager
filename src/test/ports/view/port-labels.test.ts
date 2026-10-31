import * as assert from 'assert';
import { KeyValueStore } from '../../../features/ports/view/key-value-store';
import { LabelStore, MAX_LABEL_LENGTH, normalizeLabel, validateLabel } from '../../../features/ports/view/port-labels';

/** An in-memory stand-in for VS Code's globalState. */
function memoryStore(initial: Record<string, unknown> = {}): KeyValueStore & { data: Record<string, unknown> } {
	const data = { ...initial };
	return {
		data,
		get: <T>(key: string, fallback: T) => (key in data ? (data[key] as T) : fallback),
		update: async (key, value) => void (data[key] = value),
	};
}

suite('validateLabel', () => {
	test('accepts ordinary names and the empty name (which removes the label)', () => {
		assert.strictEqual(validateLabel('frontend'), undefined);
		assert.strictEqual(validateLabel(''), undefined);
		assert.strictEqual(validateLabel('   '), undefined);
	});

	test('rejects a name that is too long, measured after trimming', () => {
		assert.strictEqual(validateLabel('x'.repeat(MAX_LABEL_LENGTH)), undefined);
		assert.strictEqual(validateLabel(`  ${'x'.repeat(MAX_LABEL_LENGTH)}  `), undefined);
		assert.match(validateLabel('x'.repeat(MAX_LABEL_LENGTH + 1)) ?? '', /40 characters or fewer/);
	});
});

suite('normalizeLabel', () => {
	test('trims and collapses whitespace', () => {
		assert.strictEqual(normalizeLabel('  my   api \n'), 'my api');
	});

	test('treats an empty or blank name as no name', () => {
		assert.strictEqual(normalizeLabel(''), undefined);
		assert.strictEqual(normalizeLabel('  \t '), undefined);
	});
});

suite('LabelStore', () => {
	test('has no names to begin with', () => {
		assert.strictEqual(new LabelStore(memoryStore()).get(3000), undefined);
	});

	test('remembers a name per port', async () => {
		const labels = new LabelStore(memoryStore());
		await labels.set(3000, 'frontend');
		await labels.set(5432, 'database');
		assert.strictEqual(labels.get(3000), 'frontend');
		assert.strictEqual(labels.get(5432), 'database');
		assert.strictEqual(labels.get(8080), undefined);
	});

	test('keeps names across a restart, because they live in the stored data', async () => {
		const storage = memoryStore();
		await new LabelStore(storage).set(3000, 'frontend');
		assert.strictEqual(new LabelStore(storage).get(3000), 'frontend');
	});

	test('removes a name when set to undefined, and leaves the others', async () => {
		const labels = new LabelStore(memoryStore());
		await labels.set(3000, 'frontend');
		await labels.set(5432, 'database');
		await labels.set(3000, undefined);
		assert.strictEqual(labels.get(3000), undefined);
		assert.strictEqual(labels.get(5432), 'database');
	});

	test('tells listeners about every change, and stops after dispose', async () => {
		const labels = new LabelStore(memoryStore());
		let changes = 0;
		const subscription = labels.onDidChange(() => changes++);
		await labels.set(3000, 'a');
		await labels.set(3000, undefined);
		subscription.dispose();
		await labels.set(3000, 'b');
		assert.strictEqual(changes, 2);
	});

	test('does not trust stored data of the wrong shape', () => {
		for (const stored of ['text', 42, null, ['a', 'b'], { 3000: 5 }, { 3000: '' }]) {
			assert.strictEqual(new LabelStore(memoryStore({ 'portManager.labels': stored })).get(3000), undefined, JSON.stringify(stored));
		}
	});

	test('survives setting a name when the stored data is corrupt', async () => {
		const labels = new LabelStore(memoryStore({ 'portManager.labels': 'corrupt' }));
		await labels.set(3000, 'frontend');
		assert.strictEqual(labels.get(3000), 'frontend');
	});
});
