import * as assert from 'assert';
import { PortListingError } from '../../../features/ports/port-types';
import { PollingDemand } from '../../../features/ports/service/polling-demand';
import { PortsService } from '../../../features/ports/service/ports-service';
import { registerStatusBar } from '../../../features/ports/view/register-status-bar';
import { ViewOptions } from '../../../features/ports/view/view-options';
import { fake, ThemeColor } from '../../fakes/vscode';
import { fakeAdapter, port } from '../../helpers/adapter';
import { memoryStore } from '../../helpers/memory-store';
import { fakeSettings } from '../../helpers/settings';

const PORTS = [
	port({ port: 3000, pid: 100 }),
	port({ port: 5432, pid: 200, processName: 'postgres' }),
	port({ port: 53, pid: undefined, processName: undefined, user: undefined }),
];

function setup(settingsOverrides = {}) {
	const { adapter, state } = fakeAdapter(PORTS);
	const service = new PortsService(adapter);
	const options = new ViewOptions(memoryStore());
	const settings = fakeSettings(settingsOverrides);
	const demandCalls: boolean[] = [];
	const demand = new PollingDemand({ setPollingEnabled: enabled => void demandCalls.push(enabled) });
	const disposable = registerStatusBar(service, demand, settings, options);
	const item = fake.statusBarItems[0];
	return { adapter, state, service, options, settings, demandCalls, disposable, item };
}

beforeEach(() => fake.reset());

suite('status bar item', () => {
	test('is named and, when clicked, focuses the Port Manager view', () => {
		const { item } = setup();
		assert.strictEqual(item.id, 'port-manager.status');
		assert.strictEqual(item.name, 'Port Manager');
		assert.strictEqual(item.command, 'port-manager.ports.focus');
		assert.strictEqual(item.visible, true);
	});

	test('shows an ellipsis until the first scan has finished', () => {
		const { item } = setup();
		assert.strictEqual(item.text, '$(plug) …');
		assert.strictEqual(item.tooltip, 'Scanning for listening ports…');
	});

	test('shows the plug icon and the number of listening ports, with a tooltip that says what a click does', async () => {
		const { item, service } = setup();
		await service.refresh();
		assert.strictEqual(item.text, '$(plug) 3');
		assert.strictEqual(item.tooltip, '3 listening ports. Click to open Port Manager.');
		assert.strictEqual(item.backgroundColor, undefined);
	});

	test('says "port" for exactly one', async () => {
		const { item, service, state } = setup();
		state.ports = [PORTS[0]];
		await service.refresh();
		assert.strictEqual(item.text, '$(plug) 1');
		assert.match(String(item.tooltip), /^1 listening port\./);
	});

	test('turns yellow after a failed scan, keeps the last count, and gives the reason', async () => {
		const { item, service, adapter } = setup();
		await service.refresh();
		adapter.listPorts = async () => {
			throw new PortListingError('ss did not finish.', 'timeout');
		};
		await service.refresh();
		assert.strictEqual(item.text, '$(plug) 3');
		assert.strictEqual((item.backgroundColor as ThemeColor).id, 'statusBarItem.warningBackground');
		assert.match(String(item.tooltip), /^Timed out\. ss did not finish\.\n3 listening ports/);
	});

	test('with running only on, counts just the rows the list shows and says so', async () => {
		const { item, service, options } = setup();
		await service.refresh();
		await options.setRunningOnly(true);
		assert.strictEqual(item.text, '$(plug) 2');
		assert.match(String(item.tooltip), /^2 listening ports \(running only\)\./);
	});
});

suite('status bar setting', () => {
	test('is shown by default, and asks for polling while shown', () => {
		const { item, demandCalls } = setup();
		assert.strictEqual(item.visible, true);
		assert.strictEqual(demandCalls.at(-1), true);
	});

	test('portManager.showStatusBar = false hides it and stops asking for polling', () => {
		const { item, demandCalls } = setup({ showStatusBar: false });
		assert.strictEqual(item.visible, false);
		assert.strictEqual(demandCalls.at(-1), false);
	});

	test('turning the setting off hides the item at once, and on shows it again with the current count', async () => {
		const { item, service, settings, demandCalls } = setup();
		await service.refresh();
		settings.update({ showStatusBar: false });
		assert.strictEqual(item.visible, false);
		assert.strictEqual(demandCalls.at(-1), false);
		settings.update({ showStatusBar: true });
		assert.strictEqual(item.visible, true);
		assert.strictEqual(item.text, '$(plug) 3');
		assert.strictEqual(demandCalls.at(-1), true);
	});

	test('disposing releases the item', () => {
		const { disposable } = setup();
		disposable.dispose();
		assert.deepStrictEqual(fake.live(), []);
	});
});
