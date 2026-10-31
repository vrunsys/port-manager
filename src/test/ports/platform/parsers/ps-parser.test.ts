import * as assert from 'assert';
import { parsePs } from '../../../../features/ports/platform/parsers/ps-parser';
import { HELPER, HELPER_PEER } from '../../../fixtures/linux-capture';
import { linux } from '../../../fixtures/load-fixtures';

suite('parsePs (real `ps -o pid=,user:32=,args=` capture)', () => {
	const details = parsePs(linux.ps);

	test('maps every pid to its user and command line', () => {
		assert.deepStrictEqual([...details.keys()], [1691, 1695, 8146, 8227, 9374, HELPER, HELPER_PEER]);
		assert.ok([...details.values()].every(d => d.user === 'dev'));
		assert.strictEqual(details.get(1695)?.command, '/usr/bin/python3 /usr/bin/ulauncher --autostart-method-xdg');
	});

	test('keeps long command lines in one piece', () => {
		assert.match(details.get(HELPER)?.command ?? '', /^\/home\/dev\/\.nvm\/.*\/bin\/node -e /);
	});
});
