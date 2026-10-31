import * as assert from 'assert';
import { describeCriticalProcess } from '../../../features/ports/kill/critical-processes';

const named = (processName: string | undefined, command?: string) => ({ processName, command });

suite('describeCriticalProcess', () => {
	test('names the Windows processes whose loss crashes the machine', () => {
		for (const name of ['System', 'smss.exe', 'csrss', 'wininit', 'winlogon', 'services', 'lsass.exe', 'svchost']) {
			assert.match(describeCriticalProcess(named(name), 'win32') ?? '', /is critical to Windows/, name);
		}
	});

	test('names the macOS processes that end the session', () => {
		for (const name of ['launchd', 'WindowServer', 'loginwindow', 'kernel_task']) {
			assert.match(describeCriticalProcess(named(name), 'darwin') ?? '', /is critical to macOS/, name);
		}
	});

	test('names the Linux processes that end the desktop session', () => {
		for (const name of ['systemd', 'Xorg', 'Xwayland', 'gnome-shell', 'dbus-daemon']) {
			assert.match(describeCriticalProcess(named(name), 'linux') ?? '', /is critical to the desktop session/, name);
		}
	});

	test('ignores case and a .exe suffix', () => {
		assert.ok(describeCriticalProcess(named('LSASS.EXE'), 'win32'));
	});

	test('matches the executable in the command line when the reported name is a thread name', () => {
		assert.match(describeCriticalProcess(named('MainThread', '/usr/bin/gnome-shell'), 'linux') ?? '', /"gnome-shell"/);
		assert.match(describeCriticalProcess(named(undefined, 'C:\\Windows\\System32\\lsass.exe'), 'win32') ?? '', /"lsass"/);
	});

	test('does not match a name that merely contains a critical one', () => {
		assert.strictEqual(describeCriticalProcess(named('systemd-resolve'), 'linux'), undefined);
		assert.strictEqual(describeCriticalProcess(named('svchost-helper'), 'win32'), undefined);
	});

	test('applies only to the platform it names', () => {
		assert.strictEqual(describeCriticalProcess(named('lsass'), 'linux'), undefined);
		assert.strictEqual(describeCriticalProcess(named('Xorg'), 'win32'), undefined);
	});

	test('has nothing to say about an unknown process or an unsupported platform', () => {
		assert.strictEqual(describeCriticalProcess(named(undefined), 'win32'), undefined);
		assert.strictEqual(describeCriticalProcess(named('lsass'), 'aix'), undefined);
	});
});
