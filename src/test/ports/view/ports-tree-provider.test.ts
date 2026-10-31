import * as assert from 'assert';
import { PortInfo } from '../../../features/ports/port-types';
import { PortsService } from '../../../features/ports/service/ports-service';
import { LabelStore } from '../../../features/ports/view/port-labels';
import { PortItem, PortsTreeProvider } from '../../../features/ports/view/ports-tree-provider';
import { ViewOptions } from '../../../features/ports/view/view-options';
import { fake, MarkdownString, ThemeIcon } from '../../fakes/vscode';
import { fakeAdapter, port } from '../../helpers/adapter';
import { memoryStore } from '../../helpers/memory-store';
import { fakeSettings } from '../../helpers/settings';

const NORMAL = port({ port: 3000, pid: 100, processName: 'node', command: 'node server.js' });
const HIDDEN = port({ port: 53, pid: undefined, processName: undefined, user: undefined });
const PROTECTED = port({ port: 22, pid: 200, processName: 'sshd' });
const SYSTEM = port({ port: 5000, pid: 1, processName: 'launchd' });

async function viewOf(ports: PortInfo[], settings = fakeSettings({ protectedPorts: [22] })) {
	const { adapter, state } = fakeAdapter(ports);
	const service = new PortsService(adapter);
	await service.refresh();
	const labels = new LabelStore(memoryStore());
	const options = new ViewOptions(memoryStore());
	const provider = new PortsTreeProvider(service, settings, labels, options);
	const item = (portNumber: number): PortItem => provider.getChildren().find(row => row.info.port === portNumber)!;
	return { service, state, labels, options, settings, provider, item };
}

const icon = (item: PortItem) => item.iconPath as ThemeIcon;

beforeEach(() => fake.reset());

suite('tree rows', () => {
	test('a normal row: port and process, then address and pid in grey, a blue stop-circle, and the stop button', async () => {
		const { item } = await viewOf([NORMAL, HIDDEN, PROTECTED]);
		const row = item(3000);
		assert.strictEqual(row.label, '3000  node');
		assert.strictEqual(row.description, '127.0.0.1 · pid 100');
		assert.strictEqual(icon(row).id, 'stop-circle');
		assert.strictEqual(icon(row).color?.id, 'textLink.foreground');
		assert.strictEqual(row.contextValue, 'port');
	});

	test('a row whose process is hidden: no name, says so, greyed out, and no PID actions', async () => {
		const { item } = await viewOf([NORMAL, HIDDEN, PROTECTED]);
		const row = item(53);
		assert.strictEqual(row.label, '53  Unknown process');
		assert.strictEqual(row.description, '127.0.0.1 · process hidden');
		assert.strictEqual(icon(row).id, 'stop-circle');
		assert.strictEqual(icon(row).color?.id, 'disabledForeground');
		assert.strictEqual(row.contextValue, 'port-hidden');
	});

	test('a protected row: still listed, greyed out, tooltip says why, and no stop button', async () => {
		const { item } = await viewOf([NORMAL, HIDDEN, PROTECTED]);
		const row = item(22);
		assert.strictEqual(row.label, '22  sshd');
		assert.strictEqual(icon(row).color?.id, 'disabledForeground');
		assert.strictEqual(row.contextValue, 'port-protected');
		assert.match((row.tooltip as MarkdownString).value, /\*\*Protected:\*\* port 22 is listed in portManager\.protectedPorts/);
	});

	test('a system process is treated like a protected one, with no setting needed', async () => {
		const { item } = await viewOf([SYSTEM], fakeSettings());
		assert.strictEqual(item(5000).contextValue, 'port-protected');
		assert.match((item(5000).tooltip as MarkdownString).value, /process 1 is the system init process/);
	});

	test('an unprotected row has no protection note in its tooltip, and shows its command', async () => {
		const { item } = await viewOf([NORMAL]);
		const tooltip = (item(3000).tooltip as MarkdownString).value;
		assert.doesNotMatch(tooltip, /Protected/);
		assert.match(tooltip, /node server\.js/);
	});

	test('a name you gave the port takes the title, and the process moves to the grey text', async () => {
		const { item, labels } = await viewOf([NORMAL]);
		await labels.set(3000, 'frontend');
		assert.strictEqual(item(3000).label, '3000  frontend');
		assert.strictEqual(item(3000).description, 'node · pid 100');
		assert.match((item(3000).tooltip as MarkdownString).value, /Name: ` frontend `/);
	});

	test('rows keep a stable id, so the selection survives a refresh', async () => {
		const { item } = await viewOf([NORMAL, HIDDEN]);
		assert.strictEqual(item(3000).id, 'tcp:3000:100');
		assert.strictEqual(item(53).id, 'tcp:53:hidden');
	});

	test('getTreeItem returns the row itself', async () => {
		const { provider, item } = await viewOf([NORMAL]);
		assert.strictEqual(provider.getTreeItem(item(3000)).label, '3000  node');
	});
});

suite('tree rows follow the options', () => {
	test('shows every port, ordered by port, by default', async () => {
		const { provider } = await viewOf([NORMAL, HIDDEN, PROTECTED]);
		assert.deepStrictEqual(provider.getChildren().map(row => row.info.port), [22, 53, 3000]);
	});

	test('running only leaves out the row whose process is hidden', async () => {
		const { provider, options } = await viewOf([NORMAL, HIDDEN, PROTECTED]);
		await options.setRunningOnly(true);
		assert.deepStrictEqual(provider.getChildren().map(row => row.info.port), [22, 3000]);
	});

	test('the search narrows the rows', async () => {
		const { provider, options } = await viewOf([NORMAL, HIDDEN, PROTECTED]);
		options.setQuery('sshd');
		assert.deepStrictEqual(provider.getChildren().map(row => row.info.port), [22]);
	});

	test('the sort order changes the rows', async () => {
		const { provider, options } = await viewOf([NORMAL, PROTECTED]);
		await options.setSort('pid');
		assert.deepStrictEqual(provider.getChildren().map(row => row.info.pid), [100, 200]);
	});
});

suite('tree redraws', () => {
	test('the tree redraws when the ports, a name, the search or the settings change, and not after dispose', async () => {
		const { provider, service, state, labels, options, settings } = await viewOf([NORMAL]);
		let redraws = 0;
		provider.onDidChangeTreeData(() => redraws++);

		state.ports = [NORMAL, PROTECTED];
		await service.refresh();
		assert.strictEqual(redraws, 1, 'ports changed');
		await labels.set(3000, 'frontend');
		assert.strictEqual(redraws, 2, 'a name was given');
		options.setQuery('node');
		assert.strictEqual(redraws, 3, 'the search changed');
		settings.update({ protectedPorts: [3000] });
		assert.strictEqual(redraws, 4, 'a setting changed');

		provider.dispose();
		await labels.set(3000, undefined);
		options.setQuery('');
		settings.update({ protectedPorts: [] });
		assert.strictEqual(redraws, 4, 'nothing after dispose');
	});

	test('disposing releases its event emitter', async () => {
		const { provider } = await viewOf([NORMAL]);
		assert.ok(fake.live().includes('event emitter'));
		provider.dispose();
		assert.deepStrictEqual(fake.live(), []);
	});
});
