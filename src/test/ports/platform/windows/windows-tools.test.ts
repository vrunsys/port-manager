import * as assert from 'assert';
import { windowsTool } from '../../../../features/ports/platform/windows/windows-tools';

suite('windowsTool', () => {
	const env = { SystemRoot: 'C:\\WINDOWS' };

	test('puts the tools under System32', () => {
		assert.strictEqual(windowsTool('netstat', env), 'C:\\WINDOWS\\System32\\netstat.exe');
		assert.strictEqual(windowsTool('tasklist', env), 'C:\\WINDOWS\\System32\\tasklist.exe');
		assert.strictEqual(windowsTool('taskkill', env), 'C:\\WINDOWS\\System32\\taskkill.exe');
	});

	test('finds PowerShell in its own folder', () => {
		assert.strictEqual(windowsTool('powershell', env), 'C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe');
	});

	test('falls back to windir, then to C:\\Windows, when SystemRoot is missing', () => {
		assert.strictEqual(windowsTool('netstat', { windir: 'D:\\Win' }), 'D:\\Win\\System32\\netstat.exe');
		assert.strictEqual(windowsTool('netstat', {}), 'C:\\Windows\\System32\\netstat.exe');
	});
});
