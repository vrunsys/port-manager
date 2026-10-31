import * as assert from 'assert';
import { buildAncestorsScript, listAncestors, parseAncestors } from '../../../../features/ports/platform/windows/windows-ancestors';
import { CommandError } from '../../../../shared/run-command';
import { fakeWindowsRunner } from '../../../helpers/windows-runner';

suite('buildAncestorsScript', () => {
	test('walks up from the given pid with a bounded loop', () => {
		const script = buildAncestorsScript(1234);
		assert.match(script, /\$current = 1234\b/);
		assert.match(script, /\$i -lt 32/);
		assert.match(script, /Get-CimInstance Win32_Process/);
	});

	test('only ever places an integer in the script', () => {
		for (const pid of [0, -1, 1.5, NaN, Infinity]) {
			assert.throws(() => buildAncestorsScript(pid), /Not a process id/, String(pid));
		}
	});
});

suite('parseAncestors', () => {
	test('reads a JSON list of pids', () => {
		assert.deepStrictEqual(parseAncestors('[8800,500,4]'), [8800, 500, 4]);
		assert.deepStrictEqual(parseAncestors('[]'), []);
	});

	test('accepts the bare number ConvertTo-Json may print for one item, and a byte order mark', () => {
		assert.deepStrictEqual(parseAncestors('500'), [500]);
		assert.deepStrictEqual(parseAncestors('\uFEFF[1,2]\r\n'), [1, 2]);
	});

	test('rejects anything that is not a list of positive integers', () => {
		for (const bad of ['', 'oops', '["a"]', '[1.5]', '[0]', '[-3]', '{"a":1}', 'null']) {
			assert.strictEqual(parseAncestors(bad), undefined, bad);
		}
	});
});

suite('listAncestors', () => {
	test('returns the ancestors PowerShell printed', async () => {
		const runner = fakeWindowsRunner({ powershell: '[800,4]' });
		assert.deepStrictEqual(await listAncestors(runner.run, 9000), [800, 4]);
		assert.match(runner.calls[0].file, /WindowsPowerShell[\\/]v1\.0[\\/]powershell\.exe$/i);
	});

	test('returns undefined, not a guess, when PowerShell fails or prints nonsense', async () => {
		assert.strictEqual(await listAncestors(fakeWindowsRunner({}).run, 9000), undefined);
		assert.strictEqual(await listAncestors(fakeWindowsRunner({ powershell: new CommandError('x', 'timeout', '', '') }).run, 9000), undefined);
		assert.strictEqual(await listAncestors(fakeWindowsRunner({ powershell: 'garbage' }).run, 9000), undefined);
	});
});
