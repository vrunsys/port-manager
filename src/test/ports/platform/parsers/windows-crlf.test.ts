import * as assert from 'assert';
import { parsePowerShellPorts } from '../../../../features/ports/platform/parsers/powershell-parser';
import { parseTasklistCsv } from '../../../../features/ports/platform/parsers/tasklist-parser';
import { parseWindowsNetstat } from '../../../../features/ports/platform/parsers/windows-netstat-parser';
import { windows } from '../../../fixtures/load-fixtures';
import { portsAndPids } from '../../../helpers/rows';

suite('Windows output with CRLF line endings (what the real tools print)', () => {
	const crlf = (text: string) => text.replace(/\r?\n/g, '\r\n');

	test('netstat rows are found in every language', () => {
		for (const [language, output] of Object.entries(windows.netstat)) {
			assert.deepStrictEqual(
				portsAndPids(parseWindowsNetstat(crlf(output))),
				portsAndPids(parseWindowsNetstat(output)),
				language,
			);
		}
	});

	test('tasklist names do not keep a trailing carriage return', () => {
		const names = parseTasklistCsv(crlf(windows.tasklist));
		assert.strictEqual(names.get(5521), 'node.exe');
		assert.deepStrictEqual([...names.values()], [...parseTasklistCsv(windows.tasklist).values()]);
	});

	test('PowerShell JSON parses', () => {
		assert.strictEqual(parsePowerShellPorts(crlf(windows.powershellJson)).length, 5);
	});
});
