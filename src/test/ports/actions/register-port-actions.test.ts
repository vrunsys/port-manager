import * as assert from 'assert';
import { registerPortActions } from '../../../features/ports/actions/register-port-actions';
import { PortInfo } from '../../../features/ports/port-types';
import { PortsService } from '../../../features/ports/service/ports-service';
import { LabelStore } from '../../../features/ports/view/port-labels';
import { PortItem } from '../../../features/ports/view/ports-tree-provider';
import { fake } from '../../fakes/vscode';
import { fakeAdapter, port } from '../../helpers/adapter';
import { memoryStore } from '../../helpers/memory-store';
import { fakeSettings } from '../../helpers/settings';

// The glue asks the operating system who is logged in. Fixing the answer keeps these tests the same on every machine:
// every row below is owned by "varun", and a runner or a colleague's computer has a different account.
const { account } = vi.hoisted(() => ({ account: { name: 'varun', unavailable: false } }));
vi.mock('os', async importOriginal => {
	const actual = await importOriginal<typeof import('os')>();
	const userInfo = (): ReturnType<typeof actual.userInfo> => {
		if (account.unavailable) {
			throw new Error('no passwd entry for this uid');
		}
		return { username: account.name, uid: 1000, gid: 1000, shell: null, homedir: '/home/test' };
	};
	return { ...actual, default: { ...actual, userInfo }, userInfo };
});

const ROW_COMMANDS = ['kill', 'rename', 'copyPort', 'copyPid', 'openInBrowser'].map(name => `port-manager.${name}`);
const NODE = port({ port: 3000, pid: 100, processName: 'node', command: 'node server.js' });
const SSHD = port({ port: 22, pid: 200, processName: 'sshd' });

async function registered(ports: PortInfo[] = [NODE], settingsOverrides = {}) {
	const { adapter, state } = fakeAdapter(ports);
	const service = new PortsService(adapter);
	await service.refresh();
	const labels = new LabelStore(memoryStore());
	const disposable = registerPortActions(service, fakeSettings(settingsOverrides), labels);
	const rowOf = (info: PortInfo) => new PortItem(info, undefined, labels.get(info.port));
	return { service, state, labels, disposable, rowOf };
}

/** Nothing the user could see or that touched the system. */
function noEffects(adapterKilled: number[]) {
	assert.deepStrictEqual(fake.modals, []);
	assert.deepStrictEqual(fake.warnings, []);
	assert.deepStrictEqual(fake.errors, []);
	assert.deepStrictEqual(fake.clipboard, []);
	assert.deepStrictEqual(fake.opened, []);
	assert.deepStrictEqual(fake.statusMessages, []);
	assert.deepStrictEqual(fake.prompts, []);
	assert.deepStrictEqual(adapterKilled, []);
}

beforeEach(() => {
	fake.reset();
	account.name = 'varun';
	account.unavailable = false;
});

suite('row commands ignore anything that is not a row', () => {
	class LooksLikeARow {
		info = NODE;
	}
	const notRows: Array<[string, unknown]> = [
		['nothing (a keybinding)', undefined],
		['null', null],
		['a string', 'port-manager'],
		['a number', 3000],
		['an empty object', {}],
		['an object that only looks like a row: { info }', { info: NODE }],
		['an instance of another class with an info field', new LooksLikeARow()],
		['an array', [NODE]],
	];

	test('all five commands return at once and do nothing, for every kind of wrong argument', async () => {
		const { state } = await registered();
		for (const command of ROW_COMMANDS) {
			for (const [what, argument] of notRows) {
				assert.strictEqual(fake.invoke(command, argument), undefined, `${command} with ${what}`);
			}
		}
		noEffects(state.killed);
	});
});

suite('row commands with a real row', () => {
	test('Copy Port puts the port on the clipboard', async () => {
		const { rowOf } = await registered();
		await fake.invoke('port-manager.copyPort', rowOf(NODE));
		assert.deepStrictEqual(fake.clipboard, ['3000']);
		assert.deepStrictEqual(fake.statusMessages, ['Copied port 3000']);
	});

	test('Copy PID puts the PID on the clipboard', async () => {
		const { rowOf } = await registered();
		await fake.invoke('port-manager.copyPid', rowOf(NODE));
		assert.deepStrictEqual(fake.clipboard, ['100']);
	});

	test('Open in Browser opens http://localhost:<port>', async () => {
		const { rowOf } = await registered();
		await fake.invoke('port-manager.openInBrowser', rowOf(NODE));
		assert.deepStrictEqual(fake.opened, ['http://localhost:3000']);
	});

	test('Rename asks with the port in the title, and remembers the tidied answer', async () => {
		const { rowOf, labels } = await registered();
		fake.nextInputBoxAnswer = '  my   api ';
		await fake.invoke('port-manager.rename', rowOf(NODE));
		assert.strictEqual((fake.prompts[0] as { title: string }).title, 'Name for port 3000');
		assert.strictEqual(labels.get(3000), 'my api');
	});

	test('Rename does nothing when the box is dismissed', async () => {
		const { rowOf, labels } = await registered();
		fake.nextInputBoxAnswer = undefined;
		await fake.invoke('port-manager.rename', rowOf(NODE));
		assert.strictEqual(labels.get(3000), undefined);
	});

	test('Kill asks first, naming the process, and does nothing when the dialog is closed', async () => {
		const { rowOf, state } = await registered();
		await fake.invoke('port-manager.kill', rowOf(NODE));
		assert.strictEqual(fake.modals[0].message, 'Stop node (PID 100)?');
		assert.deepStrictEqual(fake.modals[0].buttons, ['Stop Process']);
		assert.deepStrictEqual(state.killed, []);
	});

	test('Kill warns and asks again, whatever the settings, for a process owned by another account', async () => {
		account.name = 'runner';
		const { rowOf, state } = await registered([NODE], { confirmBeforeKill: false });
		await fake.invoke('port-manager.kill', rowOf(NODE));
		assert.strictEqual(fake.modals[0].message, 'Stop node (PID 100) owned by varun?');
		assert.deepStrictEqual(fake.modals[0].buttons, ['Stop Anyway']);
		assert.deepStrictEqual(state.killed, []);
	});

	test('Kill gives no ownership warning when the operating system cannot say who you are', async () => {
		account.unavailable = true;
		const { rowOf } = await registered();
		await fake.invoke('port-manager.kill', rowOf(NODE));
		assert.strictEqual(fake.modals[0].message, 'Stop node (PID 100)?');
	});

	test('Kill stops the process once the button is pressed, and says so', async () => {
		const { rowOf, state } = await registered();
		fake.nextModalButton = (_message, buttons) => buttons[0];
		await fake.invoke('port-manager.kill', rowOf(NODE));
		assert.deepStrictEqual(state.killed, [100]);
		assert.deepStrictEqual(fake.statusMessages, ['Stopped node (PID 100).']);
	});

	test('Kill refuses a protected port without asking', async () => {
		const { rowOf, state } = await registered([SSHD], { protectedPorts: [22] });
		await fake.invoke('port-manager.kill', rowOf(SSHD));
		assert.match(fake.warnings[0], /Port 22 is protected/);
		assert.deepStrictEqual(fake.modals, []);
		assert.deepStrictEqual(state.killed, []);
	});
});

suite('Kill Process on Port…', () => {
	test('needs no argument, and offers only the ports that can be stopped', async () => {
		const { state } = await registered([NODE, SSHD], { protectedPorts: [22] });
		await fake.invoke('port-manager.killByPort');
		assert.strictEqual(fake.quickPicks.length, 1);
		assert.deepStrictEqual((fake.quickPicks[0] as Array<{ label: string }>).map(item => item.label), ['3000']);
		assert.deepStrictEqual(state.killed, []);
	});

	test('shows the name you gave a port next to it, so it can be found by that name', async () => {
		const { labels } = await registered();
		await labels.set(3000, 'frontend');
		await fake.invoke('port-manager.killByPort');
		const [item] = fake.quickPicks[0] as Array<{ description: string }>;
		assert.match(item.description, /^frontend · tcp · node · PID 100/);
	});

	test('goes on to the same confirmation as the tree', async () => {
		await registered();
		fake.nextQuickPick = items => items[0];
		await fake.invoke('port-manager.killByPort');
		assert.strictEqual(fake.modals[0].message, 'Stop node (PID 100)?');
	});
});

suite('registration', () => {
	test('registers the six commands, and disposing releases them', async () => {
		const { disposable } = await registered();
		assert.deepStrictEqual(fake.commandIds(), [...ROW_COMMANDS, 'port-manager.killByPort'].sort());
		disposable.dispose();
		assert.deepStrictEqual(fake.live(), []);
	});
});
