import * as assert from 'assert';
import { executableName, normalizeProcessName } from '../../shared/process-names';

suite('normalizeProcessName', () => {
	test('ignores case, surrounding spaces and a .exe suffix', () => {
		assert.strictEqual(normalizeProcessName('  Node.EXE '), 'node');
	});
});

suite('executableName', () => {
	test('takes the program from a Unix command line, ignoring its arguments', () => {
		assert.strictEqual(executableName('/usr/bin/node server.js --port 3000'), 'node');
		assert.strictEqual(executableName('python3 -m http.server'), 'python3');
	});

	test('handles a daemon that rewrote its title with a colon', () => {
		assert.strictEqual(executableName('sshd: /usr/sbin/sshd -D'), 'sshd');
	});

	test('takes a whole Windows path that contains spaces', () => {
		assert.strictEqual(executableName('C:\\Program Files\\nodejs\\node.exe'), 'node');
	});

	test('takes the program name of a macOS app whose path contains spaces', () => {
		assert.strictEqual(executableName('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome --remote-debugging-port=9222'), 'google chrome');
		assert.strictEqual(executableName('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'), 'google chrome');
	});

	test('does not take a flag for part of the app name', () => {
		assert.strictEqual(executableName('/Applications/Code.app/Contents/MacOS/Electron -psn_0_1234'), 'electron');
	});

	test('returns an empty name for an empty command', () => {
		assert.strictEqual(executableName('   '), '');
	});
});
