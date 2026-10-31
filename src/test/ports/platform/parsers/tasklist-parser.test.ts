import * as assert from 'assert';
import { parseTasklistCsv } from '../../../../features/ports/platform/parsers/tasklist-parser';
import { windows } from '../../../fixtures/load-fixtures';

suite('parseTasklistCsv', () => {
	const names = parseTasklistCsv(windows.tasklist);

	test('maps pid to image name by column position, keeping quoted commas intact', () => {
		assert.strictEqual(names.get(1032), 'svchost.exe');
		assert.strictEqual(names.get(5521), 'node.exe');
		assert.strictEqual(names.get(0), 'System Idle Process');
		assert.strictEqual(names.size, 6);
	});

	test('keeps non-ASCII image names', () => {
		assert.strictEqual(names.get(6001), 'Яндекс.exe');
	});

	test('ignores blank and malformed lines', () => {
		assert.strictEqual(parseTasklistCsv('\n"only one field"\n"x","notanumber"\n').size, 0);
	});
});
