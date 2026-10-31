import * as assert from 'assert';
import { PortInfo } from '../../../features/ports/port-types';
import { PollingDemand } from '../../../features/ports/service/polling-demand';
import { PortsService } from '../../../features/ports/service/ports-service';
import { LabelStore } from '../../../features/ports/view/port-labels';
import { PortItem } from '../../../features/ports/view/ports-tree-provider';
import { registerPortsView } from '../../../features/ports/view/register-ports-view';
import { ViewOptions } from '../../../features/ports/view/view-options';
import { fake } from '../../fakes/vscode';
import { fakeAdapter, port } from '../../helpers/adapter';
import { memoryStore } from '../../helpers/memory-store';
import { fakeSettings } from '../../helpers/settings';

const PORTS = [
	port({ port: 3000, pid: 100, processName: 'node' }),
	port({ port: 5432, pid: 200, processName: 'postgres' }),
	port({ port: 53, pid: undefined, processName: undefined, user: undefined }),
];

async function registered(ports: PortInfo[] = PORTS) {
	const { adapter, state } = fakeAdapter(ports);
	const service = new PortsService(adapter);
	await service.refresh();
	const options = new ViewOptions(memoryStore());
	const polling: boolean[] = [];
	const demand = new PollingDemand({ setPollingEnabled: enabled => void polling.push(enabled) });
	const disposable = registerPortsView(service, demand, fakeSettings(), new LabelStore(memoryStore()), options);
	const view = fake.treeViews[0];
	const rows = () => (view.provider.getChildren() as PortItem[]).map(row => row.info.port);
	return { service, state, options, polling, disposable, view, rows };
}

beforeEach(() => fake.reset());

// A box left open would be reused by the next test, so every test closes what it opened.
afterEach(() => fake.inputBoxes.filter(box => !box.disposed).forEach(box => box.escape()));

suite('Filter ports', () => {
	test('opens a search box titled "Filter ports" that starts with the current search', async () => {
		const { options } = await registered();
		options.setQuery('postgres');
		await fake.invoke('port-manager.filter');
		const [box] = fake.inputBoxes;
		assert.strictEqual(box.title, 'Filter ports');
		assert.strictEqual(box.placeholder, 'Search ports, processes, PIDs');
		assert.strictEqual(box.value, 'postgres');
		assert.strictEqual(box.shown, 1);
	});

	test('narrows the list as you type', async () => {
		const { rows, options } = await registered();
		await fake.invoke('port-manager.filter');
		fake.inputBoxes[0].type('node');
		assert.deepStrictEqual(rows(), [3000]);
		assert.strictEqual(options.query, 'node');
		fake.inputBoxes[0].type('5432');
		assert.deepStrictEqual(rows(), [5432]);
		fake.inputBoxes[0].type('');
		assert.deepStrictEqual(rows(), [53, 3000, 5432]);
	});

	test('Enter keeps the search and closes the box', async () => {
		const { rows, options } = await registered();
		await fake.invoke('port-manager.filter');
		fake.inputBoxes[0].type('node');
		fake.inputBoxes[0].accept();
		assert.strictEqual(options.query, 'node');
		assert.deepStrictEqual(rows(), [3000]);
		assert.strictEqual(fake.inputBoxes[0].disposed, true);
	});

	test('Escape puts the previous search back, and closes the box', async () => {
		const { rows, options } = await registered();
		options.setQuery('postgres');
		await fake.invoke('port-manager.filter');
		fake.inputBoxes[0].type('node');
		assert.deepStrictEqual(rows(), [3000]);
		fake.inputBoxes[0].escape();
		assert.strictEqual(options.query, 'postgres');
		assert.deepStrictEqual(rows(), [5432]);
		assert.strictEqual(fake.inputBoxes[0].disposed, true);
	});

	test('asking again while the box is open brings the same box back instead of opening a second', async () => {
		await registered();
		await fake.invoke('port-manager.filter');
		await fake.invoke('port-manager.filter');
		assert.strictEqual(fake.inputBoxes.length, 1);
		assert.strictEqual(fake.inputBoxes[0].shown, 2);
	});

	test('after the box closed, the next request opens a fresh one', async () => {
		await registered();
		await fake.invoke('port-manager.filter');
		fake.inputBoxes[0].escape();
		await fake.invoke('port-manager.filter');
		assert.strictEqual(fake.inputBoxes.length, 2);
		assert.strictEqual(fake.inputBoxes[1].disposed, false);
	});

	test('tells the title bar a search is active, and that it is gone again', async () => {
		await registered();
		assert.strictEqual(fake.contexts()['portManager.filterActive'], false);
		await fake.invoke('port-manager.filter');
		fake.inputBoxes[0].type('node');
		assert.strictEqual(fake.contexts()['portManager.filterActive'], true);
		fake.inputBoxes[0].escape();
		assert.strictEqual(fake.contexts()['portManager.filterActive'], false);
	});

	test('Clear Filter empties the search', async () => {
		const { rows, options } = await registered();
		options.setQuery('node');
		assert.deepStrictEqual(rows(), [3000]);
		await fake.invoke('port-manager.clearFilter');
		assert.strictEqual(options.query, '');
		assert.deepStrictEqual(rows(), [53, 3000, 5432]);
	});
});

suite('view header', () => {
	test('shows the count and sort order, with the count as a badge on the sidebar icon', async () => {
		const { view } = await registered();
		assert.strictEqual(view.description, '3 running · Sort: Port');
		assert.deepStrictEqual(view.badge, { value: 3, tooltip: '3 listening ports' });
		assert.strictEqual(view.message, undefined);
	});

	test('says how many match while searching, and when nothing does', async () => {
		const { view, options } = await registered();
		options.setQuery('node');
		assert.strictEqual(view.description, '1 of 3 · Sort: Port');
		options.setQuery('zzz');
		assert.strictEqual(view.message, 'No ports match “zzz”.');
		assert.strictEqual(view.badge?.value, 3);
	});

	test('running only reports the rows it tucked away, and tells the title bar', async () => {
		const { view, options } = await registered();
		await options.setRunningOnly(true);
		assert.strictEqual(view.description, '2 running · 1 hidden · Sort: Port');
		assert.strictEqual(view.badge?.value, 2);
		assert.strictEqual(fake.contexts()['portManager.runningOnly'], true);
		await fake.invoke('port-manager.showAllPorts');
		assert.strictEqual(view.description, '3 running · Sort: Port');
		assert.strictEqual(fake.contexts()['portManager.runningOnly'], false);
	});

	test('the Sort command applies the chosen order', async () => {
		const { view, rows } = await registered();
		fake.nextQuickPick = items => (items as Array<{ label: string }>).find(item => item.label === 'PID');
		await fake.invoke('port-manager.sort');
		assert.deepStrictEqual(rows(), [3000, 5432, 53]);
		assert.strictEqual(view.description, '3 running · Sort: PID');
	});

	test('an empty list has no header and no badge', async () => {
		const { view } = await registered([]);
		assert.strictEqual(view.description, undefined);
		assert.strictEqual(view.badge, undefined);
		assert.strictEqual(view.message, 'No listening ports');
	});
});

suite('view and polling', () => {
	test('asks for polling while the view is visible, and stops when it is hidden', async () => {
		const { view, polling } = await registered();
		assert.strictEqual(polling.at(-1), true);
		view.setVisible(false);
		assert.strictEqual(polling.at(-1), false);
		view.setVisible(true);
		assert.strictEqual(polling.at(-1), true);
	});

	test('Refresh scans again', async () => {
		const { state } = await registered();
		const before = state.scans;
		await fake.invoke('port-manager.refresh');
		assert.strictEqual(state.scans, before + 1);
	});

	test('disposing releases the view, its commands and its emitter', async () => {
		const { disposable, view } = await registered();
		disposable.dispose();
		assert.strictEqual(view.disposed, true);
		assert.deepStrictEqual(fake.live(), []);
	});
});
