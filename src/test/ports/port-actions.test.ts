import * as assert from 'assert';
import { createPortActions, PortActionsService, PortActionsUi } from '../../features/ports/port-actions';
import { DEFAULT_SETTINGS, PortSettings } from '../../features/ports/port-settings';
import { KillResult, PortInfo, UNKNOWN_LABEL } from '../../features/ports/port-types';
import { PortsState } from '../../features/ports/ports-service';

function port(overrides: Partial<PortInfo> = {}): PortInfo {
	return {
		port: 3000,
		protocol: 'tcp',
		address: '127.0.0.1',
		pid: 4242,
		processName: 'node',
		user: 'varun',
		command: 'node server.js',
		...overrides,
	};
}

const hidden = port({ pid: undefined, processName: UNKNOWN_LABEL, command: undefined });

interface Confirmation {
	message: string;
	detail: string | undefined;
	actionLabel: string;
}

interface FakeUiOptions {
	confirms?: boolean;
	opens?: boolean;
	copyError?: Error;
	/** Chooses from the offered ports; by default the first one. */
	pick?: (ports: readonly PortInfo[]) => PortInfo | undefined;
}

function fakeUi(options: FakeUiOptions = {}) {
	const log = {
		offered: [] as PortInfo[],
		confirmations: [] as Confirmation[],
		status: [] as string[],
		warnings: [] as string[],
		errors: [] as string[],
		copied: [] as string[],
		opened: [] as string[],
		progressTitles: [] as string[],
	};
	const ui: PortActionsUi = {
		async confirm(message, detail, actionLabel) {
			log.confirmations.push({ message, detail, actionLabel });
			return options.confirms ?? true;
		},
		async pickPort(ports) {
			log.offered.push(...ports);
			return (options.pick ?? (offered => offered[0]))(ports);
		},
		showStatus: text => void log.status.push(text),
		showWarning: text => void log.warnings.push(text),
		showError: text => void log.errors.push(text),
		async copy(text) {
			if (options.copyError) {
				throw options.copyError;
			}
			log.copied.push(text);
		},
		async openExternal(url) {
			log.opened.push(url);
			return options.opens ?? true;
		},
		withProgress(title, task) {
			log.progressTitles.push(title);
			return task();
		},
	};
	return { ui, log };
}

function fakeKiller(result: KillResult | Error, state: Partial<PortsState> = {}) {
	const killed: number[] = [];
	const calls: string[] = [];
	const killer: PortActionsService = {
		state: { ports: [], loaded: true, error: undefined, ...state },
		async refresh() {
			calls.push('refresh');
		},
		async killProcess(pid) {
			killed.push(pid);
			calls.push('kill');
			if (result instanceof Error) {
				throw result;
			}
			return result;
		},
	};
	return { killer, killed, calls };
}

const killedResult: KillResult = { status: 'killed', message: 'Stopped process 4242.' };

suite('kill action', () => {
	test('asks for confirmation naming the process, PID, port and command', async () => {
		const { ui, log } = fakeUi();
		await createPortActions(fakeKiller(killedResult).killer, ui).kill(port());
		assert.deepStrictEqual(log.confirmations, [
			{
				message: 'Stop node (PID 4242)?',
				detail: 'Listening on port 3000.\n\nCommand: node server.js',
				actionLabel: 'Stop Process',
			},
		]);
	});

	test('stops the process after confirmation and reports success', async () => {
		const { ui, log } = fakeUi();
		const { killer, killed } = fakeKiller(killedResult);
		await createPortActions(killer, ui).kill(port());
		assert.deepStrictEqual(killed, [4242]);
		assert.deepStrictEqual(log.progressTitles, ['Stopping node (PID 4242)…']);
		assert.deepStrictEqual(log.status, ['Stopped node (PID 4242).']);
		assert.deepStrictEqual([log.warnings, log.errors], [[], []]);
	});

	test('does nothing when the user cancels', async () => {
		const { ui, log } = fakeUi({ confirms: false });
		const { killer, killed } = fakeKiller(killedResult);
		await createPortActions(killer, ui).kill(port());
		assert.deepStrictEqual(killed, []);
		assert.deepStrictEqual([log.status, log.warnings, log.errors], [[], [], []]);
	});

	test('shows a readable error with a hint for permission-denied', async () => {
		const { ui, log } = fakeUi();
		const denied: KillResult = { status: 'permission-denied', message: 'No permission to stop process 4242.' };
		await createPortActions(fakeKiller(denied).killer, ui).kill(port());
		assert.strictEqual(log.errors.length, 1);
		assert.match(log.errors[0], /No permission to stop process 4242\./);
		assert.match(log.errors[0], /never raises its own privileges/);
	});

	test('shows a warning, not an error, for not-found', async () => {
		const { ui, log } = fakeUi();
		const gone: KillResult = { status: 'not-found', message: 'Process 4242 is not running.' };
		await createPortActions(fakeKiller(gone).killer, ui).kill(port());
		assert.deepStrictEqual(log.warnings, ['Process 4242 is not running.']);
		assert.deepStrictEqual(log.errors, []);
	});

	test('shows the message of a failed kill as an error', async () => {
		const { ui, log } = fakeUi();
		const failed: KillResult = { status: 'failed', message: 'Process 4242 is still running after SIGKILL.' };
		await createPortActions(fakeKiller(failed).killer, ui).kill(port());
		assert.deepStrictEqual(log.errors, ['Process 4242 is still running after SIGKILL.']);
	});

	test('explains instead of asking when the process is hidden', async () => {
		const { ui, log } = fakeUi();
		const { killer, killed } = fakeKiller(killedResult);
		await createPortActions(killer, ui).kill(hidden);
		assert.deepStrictEqual(log.confirmations, []);
		assert.deepStrictEqual(killed, []);
		assert.match(log.warnings[0], /Port 3000 belongs to a process/);
	});

	test('turns an unexpected exception into a readable error', async () => {
		const { ui, log } = fakeUi();
		await createPortActions(fakeKiller(new Error('adapter bug')).killer, ui).kill(port());
		assert.deepStrictEqual(log.errors, ['Port Manager: adapter bug']);
	});

	test('omits the command line from the confirmation when it is unknown', async () => {
		const { ui, log } = fakeUi();
		await createPortActions(fakeKiller(killedResult).killer, ui).kill(port({ command: undefined }));
		assert.strictEqual(log.confirmations[0].detail, 'Listening on port 3000.');
	});
});

suite('killByPort action', () => {
	const web = port({ port: 3000, pid: 100, processName: 'node' });
	const db = port({ port: 5432, pid: 200, processName: 'postgres', command: 'postgres -D /data' });

	test('refreshes first, so a hidden view still offers current ports', async () => {
		const { ui } = fakeUi({ confirms: false });
		const { killer, calls } = fakeKiller(killedResult, { ports: [web] });
		await createPortActions(killer, ui).killByPort();
		assert.strictEqual(calls[0], 'refresh');
	});

	test('offers only ports whose process can be stopped', async () => {
		const { ui, log } = fakeUi({ confirms: false });
		const { killer } = fakeKiller(killedResult, { ports: [web, hidden, db] });
		await createPortActions(killer, ui).killByPort();
		assert.deepStrictEqual(log.offered.map(p => p.port), [3000, 5432]);
	});

	test('uses the same confirmation and kill path as the tree action', async () => {
		const { ui, log } = fakeUi({ pick: ports => ports.find(p => p.port === 5432) });
		const { killer, killed } = fakeKiller(killedResult, { ports: [web, db] });
		await createPortActions(killer, ui).killByPort();
		assert.deepStrictEqual(log.confirmations, [
			{
				message: 'Stop postgres (PID 200)?',
				detail: 'Listening on port 5432.\n\nCommand: postgres -D /data',
				actionLabel: 'Stop Process',
			},
		]);
		assert.deepStrictEqual(killed, [200]);
		assert.deepStrictEqual(log.status, ['Stopped postgres (PID 200).']);
	});

	test('does nothing when the picker is dismissed', async () => {
		const { ui, log } = fakeUi({ pick: () => undefined });
		const { killer, killed } = fakeKiller(killedResult, { ports: [web] });
		await createPortActions(killer, ui).killByPort();
		assert.deepStrictEqual(killed, []);
		assert.deepStrictEqual(log.confirmations, []);
	});

	test('does not kill when the confirmation is declined', async () => {
		const { ui } = fakeUi({ confirms: false });
		const { killer, killed } = fakeKiller(killedResult, { ports: [web] });
		await createPortActions(killer, ui).killByPort();
		assert.deepStrictEqual(killed, []);
	});

	test('says so when there are no listening ports', async () => {
		const { ui, log } = fakeUi();
		await createPortActions(fakeKiller(killedResult).killer, ui).killByPort();
		assert.deepStrictEqual(log.warnings, ['No listening ports']);
		assert.deepStrictEqual(log.offered, []);
	});

	test('shows the listing error when no ports could be read', async () => {
		const { ui, log } = fakeUi();
		const error = { kind: 'tool-missing' as const, message: 'none of ss, lsof, netstat is installed.' };
		await createPortActions(fakeKiller(killedResult, { error }).killer, ui).killByPort();
		assert.deepStrictEqual(log.warnings, ['Tool missing. none of ss, lsof, netstat is installed.']);
	});

	test('explains when every port belongs to a hidden process', async () => {
		const { ui, log } = fakeUi();
		await createPortActions(fakeKiller(killedResult, { ports: [hidden] }).killer, ui).killByPort();
		assert.match(log.warnings[0], /hidden or protected/);
		assert.deepStrictEqual(log.offered, []);
	});
});

/** Settings the test can change between calls, to prove they are read live. */
function liveSettings(initial: Partial<PortSettings> = {}) {
	let current: PortSettings = { ...DEFAULT_SETTINGS, ...initial };
	return {
		get: () => current,
		update: (changes: Partial<PortSettings>) => void (current = { ...current, ...changes }),
	};
}

suite('confirmBeforeKill setting', () => {
	test('skips the confirmation and stops the process straight away when off', async () => {
		const { ui, log } = fakeUi();
		const { killer, killed } = fakeKiller(killedResult);
		await createPortActions(killer, ui, liveSettings({ confirmBeforeKill: false })).kill(port());
		assert.deepStrictEqual(log.confirmations, []);
		assert.deepStrictEqual(killed, [4242]);
		assert.deepStrictEqual(log.status, ['Stopped node (PID 4242).']);
	});

	test('asks when on, and applies a change made after the actions were created', async () => {
		const { ui, log } = fakeUi({ confirms: false });
		const { killer, killed } = fakeKiller(killedResult);
		const settings = liveSettings();
		const actions = createPortActions(killer, ui, settings);

		await actions.kill(port());
		assert.strictEqual(log.confirmations.length, 1);
		assert.deepStrictEqual(killed, []);

		settings.update({ confirmBeforeKill: false });
		await actions.kill(port());
		assert.strictEqual(log.confirmations.length, 1);
		assert.deepStrictEqual(killed, [4242]);
	});

	test('also skips the confirmation for kill-by-port', async () => {
		const { ui, log } = fakeUi();
		const { killer, killed } = fakeKiller(killedResult, { ports: [port()] });
		await createPortActions(killer, ui, liveSettings({ confirmBeforeKill: false })).killByPort();
		assert.deepStrictEqual(log.confirmations, []);
		assert.deepStrictEqual(killed, [4242]);
	});
});

suite('protected ports and processes', () => {
	test('refuses to stop a protected port, without asking, and says why', async () => {
		const { ui, log } = fakeUi();
		const { killer, killed } = fakeKiller(killedResult);
		await createPortActions(killer, ui, liveSettings({ protectedPorts: [3000] })).kill(port());
		assert.deepStrictEqual(killed, []);
		assert.deepStrictEqual(log.confirmations, []);
		assert.deepStrictEqual(log.warnings, [
			'Port 3000 is protected (port 3000 is listed in portManager.protectedPorts), so Port Manager will not stop it.',
		]);
	});

	test('refuses to stop a protected process', async () => {
		const { ui, log } = fakeUi();
		const { killer, killed } = fakeKiller(killedResult);
		await createPortActions(killer, ui, liveSettings({ protectedProcesses: ['node'] })).kill(port());
		assert.deepStrictEqual(killed, []);
		assert.match(log.warnings[0], /portManager\.protectedProcesses/);
	});

	test('protection wins even when confirmations are switched off', async () => {
		const { ui } = fakeUi();
		const { killer, killed } = fakeKiller(killedResult);
		const settings = liveSettings({ confirmBeforeKill: false, protectedPorts: [3000] });
		await createPortActions(killer, ui, settings).kill(port());
		assert.deepStrictEqual(killed, []);
	});

	test('applies a protection added after the picker listed the port', async () => {
		const settings = liveSettings();
		const { ui, log } = fakeUi({
			pick: ports => {
				settings.update({ protectedPorts: [3000] });
				return ports[0];
			},
		});
		const { killer, killed } = fakeKiller(killedResult, { ports: [port()] });
		await createPortActions(killer, ui, settings).killByPort();
		assert.deepStrictEqual(killed, []);
		assert.match(log.warnings[0], /is protected/);
	});

	test('does not offer protected ports in the kill-by-port picker', async () => {
		const { ui, log } = fakeUi({ pick: () => undefined });
		const ports = [port({ port: 22, pid: 1, processName: 'sshd' }), port({ port: 3000 })];
		const { killer } = fakeKiller(killedResult, { ports });
		await createPortActions(killer, ui, liveSettings({ protectedPorts: [22] })).killByPort();
		assert.deepStrictEqual(log.offered.map(p => p.port), [3000]);
	});

	test('says nothing can be stopped when every port is protected', async () => {
		const { ui, log } = fakeUi();
		const { killer } = fakeKiller(killedResult, { ports: [port()] });
		await createPortActions(killer, ui, liveSettings({ protectedPorts: [3000] })).killByPort();
		assert.match(log.warnings[0], /hidden or protected/);
		assert.deepStrictEqual(log.offered, []);
	});

	test('still allows copying and opening a protected port', async () => {
		const { ui, log } = fakeUi();
		const actions = createPortActions(fakeKiller(killedResult).killer, ui, liveSettings({ protectedPorts: [3000] }));
		await actions.copyPort(port());
		await actions.copyPid(port());
		await actions.openInBrowser(port());
		assert.deepStrictEqual(log.copied, ['3000', '4242']);
		assert.deepStrictEqual(log.opened, ['http://localhost:3000']);
	});
});

suite('system process guards', () => {
	const own = 5000;
	const system = { ownPid: own, parentPid: 4000, platform: 'linux' as NodeJS.Platform };
	const kill = (info: PortInfo, environment = system, ui = fakeUi()) => {
		const service = fakeKiller(killedResult, { ports: [info] });
		return { ...service, ...ui, run: () => createPortActions(service.killer, ui.ui, liveSettings(), environment).kill(info) };
	};

	test('refuses PID 1 before asking anything, and explains why', async () => {
		const attempt = kill(port({ pid: 1, processName: 'systemd' }));
		await attempt.run();
		assert.deepStrictEqual(attempt.killed, []);
		assert.deepStrictEqual(attempt.log.confirmations, []);
		assert.match(attempt.log.warnings[0], /is protected \(process 1 is the system init process\)/);
	});

	test('refuses Windows PID 4 on Windows but not elsewhere', async () => {
		const windows = kill(port({ pid: 4, processName: 'System' }), { ...system, platform: 'win32' });
		await windows.run();
		assert.deepStrictEqual(windows.killed, []);
		assert.match(windows.log.warnings[0], /Windows System process/);

		const linux = kill(port({ pid: 4 }), system);
		await linux.run();
		assert.deepStrictEqual(linux.killed, [4]);
	});

	test('refuses the extension host and its parent', async () => {
		for (const pid of [own, 4000]) {
			const attempt = kill(port({ pid }));
			await attempt.run();
			assert.deepStrictEqual(attempt.killed, [], `pid ${pid}`);
			assert.strictEqual(attempt.log.confirmations.length, 0, `pid ${pid}`);
		}
	});

	test('does not offer system processes in the kill-by-port picker', async () => {
		const { ui, log } = fakeUi({ pick: () => undefined });
		const ports = [port({ pid: 1, port: 22 }), port({ pid: own, port: 23 }), port({ pid: 100, port: 3000 })];
		const { killer } = fakeKiller(killedResult, { ports });
		await createPortActions(killer, ui, liveSettings(), system).killByPort();
		assert.deepStrictEqual(log.offered.map(p => p.port), [3000]);
	});
});

suite('processes owned by another user', () => {
	const root = port({ user: 'root', processName: 'nginx', pid: 900 });

	test('always asks, even with confirmations off, with a stronger warning and button', async () => {
		const { ui, log } = fakeUi();
		const { killer, killed } = fakeKiller(killedResult);
		const settings = liveSettings({ confirmBeforeKill: false });
		await createPortActions(killer, ui, settings, { currentUser: 'varun' }).kill(root);
		assert.strictEqual(log.confirmations.length, 1);
		assert.strictEqual(log.confirmations[0].message, 'Stop nginx (PID 900) owned by root?');
		assert.strictEqual(log.confirmations[0].actionLabel, 'Stop Anyway');
		assert.match(log.confirmations[0].detail ?? '', /belongs to another user \(root\), not to you \(varun\)/);
		assert.deepStrictEqual(killed, [900]);
	});

	test('does not stop it when the stronger warning is declined', async () => {
		const { ui } = fakeUi({ confirms: false });
		const { killer, killed } = fakeKiller(killedResult);
		await createPortActions(killer, ui, liveSettings({ confirmBeforeKill: false }), { currentUser: 'varun' }).kill(root);
		assert.deepStrictEqual(killed, []);
	});

	test('uses the normal confirmation for your own processes', async () => {
		const { ui, log } = fakeUi();
		await createPortActions(fakeKiller(killedResult).killer, ui, liveSettings(), { currentUser: 'varun' }).kill(port());
		assert.strictEqual(log.confirmations[0].actionLabel, 'Stop Process');
		assert.doesNotMatch(log.confirmations[0].detail ?? '', /another user/);
	});

	test('gives no ownership warning when the current user is unknown', async () => {
		const { ui, log } = fakeUi();
		await createPortActions(fakeKiller(killedResult).killer, ui, liveSettings(), {}).kill(root);
		assert.strictEqual(log.confirmations[0].actionLabel, 'Stop Process');
	});
});

suite('permission-denied guidance', () => {
	const denied: KillResult = { status: 'permission-denied', message: 'No permission to stop process 900.' };
	const root = port({ user: 'root', pid: 900 });

	test('tells Linux and macOS users to run sudo themselves, and that nothing elevates by itself', async () => {
		for (const platform of ['linux', 'darwin'] as const) {
			const { ui, log } = fakeUi();
			await createPortActions(fakeKiller(denied).killer, ui, liveSettings(), { platform }).kill(root);
			assert.match(log.errors[0], /No permission to stop process 900\./, platform);
			assert.match(log.errors[0], /needs elevated rights \(sudo\)/, platform);
			assert.match(log.errors[0], /sudo kill 900/, platform);
			assert.match(log.errors[0], /never raises its own privileges/, platform);
		}
	});

	test('tells Windows users to run as administrator, and that nothing elevates by itself', async () => {
		const { ui, log } = fakeUi();
		await createPortActions(fakeKiller(denied).killer, ui, liveSettings(), { platform: 'win32' }).kill(root);
		assert.match(log.errors[0], /needs administrator rights/);
		assert.match(log.errors[0], /Run as administrator/);
		assert.match(log.errors[0], /taskkill \/PID 900 \/T \/F/);
		assert.match(log.errors[0], /never raises its own privileges/);
	});

	test('does not ask for elevation for other failures', async () => {
		const { ui, log } = fakeUi();
		const failed: KillResult = { status: 'failed', message: 'Process 900 is still running after SIGKILL.' };
		await createPortActions(fakeKiller(failed).killer, ui, liveSettings(), { platform: 'linux' }).kill(root);
		assert.doesNotMatch(log.errors[0], /sudo|administrator/);
	});
});

suite('copy actions', () => {
	test('copyPort puts the port number on the clipboard', async () => {
		const { ui, log } = fakeUi();
		await createPortActions(fakeKiller(killedResult).killer, ui).copyPort(port());
		assert.deepStrictEqual(log.copied, ['3000']);
		assert.deepStrictEqual(log.status, ['Copied port 3000']);
	});

	test('copyPid puts the PID on the clipboard', async () => {
		const { ui, log } = fakeUi();
		await createPortActions(fakeKiller(killedResult).killer, ui).copyPid(port());
		assert.deepStrictEqual(log.copied, ['4242']);
		assert.deepStrictEqual(log.status, ['Copied PID 4242']);
	});

	test('copyPid explains when the PID is unknown and copies nothing', async () => {
		const { ui, log } = fakeUi();
		await createPortActions(fakeKiller(killedResult).killer, ui).copyPid(hidden);
		assert.deepStrictEqual(log.copied, []);
		assert.strictEqual(log.warnings.length, 1);
	});

	test('copyPort still works for a hidden process', async () => {
		const { ui, log } = fakeUi();
		await createPortActions(fakeKiller(killedResult).killer, ui).copyPort(hidden);
		assert.deepStrictEqual(log.copied, ['3000']);
	});

	test('reports a clipboard failure instead of throwing', async () => {
		const { ui, log } = fakeUi({ copyError: new Error('clipboard unavailable') });
		await createPortActions(fakeKiller(killedResult).killer, ui).copyPort(port());
		assert.deepStrictEqual(log.errors, ['Port Manager: clipboard unavailable']);
		assert.deepStrictEqual(log.status, []);
	});
});

suite('openInBrowser action', () => {
	test('opens http://localhost:<port>', async () => {
		const { ui, log } = fakeUi();
		await createPortActions(fakeKiller(killedResult).killer, ui).openInBrowser(port({ port: 8080 }));
		assert.deepStrictEqual(log.opened, ['http://localhost:8080']);
		assert.deepStrictEqual(log.errors, []);
	});

	test('works for a hidden process, since only the port is needed', async () => {
		const { ui, log } = fakeUi();
		await createPortActions(fakeKiller(killedResult).killer, ui).openInBrowser(hidden);
		assert.deepStrictEqual(log.opened, ['http://localhost:3000']);
	});

	test('shows an error when the browser could not be opened', async () => {
		const { ui, log } = fakeUi({ opens: false });
		await createPortActions(fakeKiller(killedResult).killer, ui).openInBrowser(port());
		assert.deepStrictEqual(log.errors, ['Could not open http://localhost:3000 in the browser.']);
	});
});
