import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import type { ExtensionContext } from 'vscode';
import { activate } from '../extension';
import { logger, setLogSink } from '../shared/logger';
import { fake } from './fakes/vscode';
import { memoryStore } from './helpers/memory-store';

// The real platform adapter would run ss, lsof or PowerShell; here it lists whatever the test says.
const adapterState = vi.hoisted(() => ({ ports: [] as unknown[], scans: 0, killed: [] as number[] }));
vi.mock('../features/ports/platform/platform-adapter-factory', () => ({
	createPlatformAdapter: () => ({
		listPorts: async () => {
			adapterState.scans++;
			return adapterState.ports;
		},
		killProcess: async (pid: number) => {
			adapterState.killed.push(pid);
			return { status: 'killed', message: `Stopped process ${pid}.` };
		},
	}),
}));

const manifest = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../package.json'), 'utf8')) as {
	contributes: { commands: Array<{ command: string }> };
};
const row = (overrides: Record<string, unknown> = {}) => ({
	port: 3000, protocol: 'tcp', address: '127.0.0.1', pid: 100, processName: 'node', user: 'varun', ...overrides,
});

function start() {
	const context = { subscriptions: [] as Array<{ dispose(): unknown }>, globalState: memoryStore() };
	activate(context as unknown as ExtensionContext);
	return { context, close: () => context.subscriptions.forEach(subscription => subscription.dispose()) };
}

beforeEach(() => {
	fake.reset();
	Object.assign(adapterState, { ports: [], scans: 0, killed: [] });
	vi.useFakeTimers();
});

afterEach(() => {
	vi.useRealTimers();
	setLogSink(undefined);
});

suite('activate()', () => {
	test('registers every command the manifest declares, and nothing else', () => {
		start();
		const declared = manifest.contributes.commands.map(entry => entry.command).sort();
		assert.strictEqual(declared.length, 12);
		assert.deepStrictEqual(fake.commandIds(), declared);
	});

	test('creates the Listening Ports view, the status bar item and the log channel', () => {
		start();
		assert.strictEqual(fake.treeViews[0].id, 'port-manager.ports');
		assert.strictEqual(fake.statusBarItems.length, 1);
		assert.strictEqual(fake.statusBarItems[0].command, 'port-manager.ports.focus');
		assert.strictEqual(fake.outputChannels[0].name, 'Port Manager');
		assert.deepStrictEqual(fake.outputChannels[0].options, { log: true });
	});

	test('sends diagnostics to the log channel, and stops when deactivated', () => {
		const { close } = start();
		logger.warn('while active');
		close();
		logger.warn('after deactivation');
		assert.deepStrictEqual(fake.outputChannels[0].lines, [['warn', 'while active']]);
	});
});

suite('activate(): polling', () => {
	test('scans at startup and then on the refresh interval, while the window is focused', async () => {
		start();
		await vi.advanceTimersByTimeAsync(0);
		assert.strictEqual(adapterState.scans, 1);
		await vi.advanceTimersByTimeAsync(2000);
		assert.strictEqual(adapterState.scans, 2);
	});

	test('does not scan in a window that is not focused, and starts when it gains focus', async () => {
		fake.setWindowFocused(false);
		start();
		await vi.advanceTimersByTimeAsync(10_000);
		assert.strictEqual(adapterState.scans, 0);
		fake.setWindowFocused(true);
		await vi.advanceTimersByTimeAsync(0);
		assert.strictEqual(adapterState.scans, 1);
	});

	test('stops scanning when the window loses focus', async () => {
		start();
		await vi.advanceTimersByTimeAsync(0);
		fake.setWindowFocused(false);
		await vi.advanceTimersByTimeAsync(10_000);
		assert.strictEqual(adapterState.scans, 1);
	});

	test('a changed refresh interval applies without a reload', async () => {
		start();
		await vi.advanceTimersByTimeAsync(0);
		fake.changeConfiguration({ 'portManager.refreshInterval': 10 });
		await vi.advanceTimersByTimeAsync(5000);
		assert.strictEqual(adapterState.scans, 1);
		await vi.advanceTimersByTimeAsync(5000);
		assert.strictEqual(adapterState.scans, 2);
	});
});

suite('activate(): settings reach the safety rules', () => {
	test('a protected port cannot be stopped through the registered kill command', async () => {
		fake.configuration['portManager.protectedPorts'] = [3000];
		adapterState.ports = [row()];
		start();
		await vi.advanceTimersByTimeAsync(0);
		const [item] = fake.treeViews[0].provider.getChildren();
		await fake.invoke('port-manager.kill', item);
		assert.match(fake.warnings[0], /Port 3000 is protected/);
		assert.deepStrictEqual(fake.modals, []);
		assert.deepStrictEqual(adapterState.killed, []);
	});

	test('protecting a port in the settings changes its row at once', async () => {
		adapterState.ports = [row()];
		start();
		await vi.advanceTimersByTimeAsync(0);
		const contextValue = () => (fake.treeViews[0].provider.getChildren()[0] as { contextValue: string }).contextValue;
		assert.strictEqual(contextValue(), 'port');
		fake.changeConfiguration({ 'portManager.protectedPorts': [3000] });
		assert.strictEqual(contextValue(), 'port-protected');
	});
});

suite('deactivation', () => {
	test('releases every command, listener, view, status bar item and channel', async () => {
		const { close } = start();
		await vi.advanceTimersByTimeAsync(0);
		assert.ok(fake.live().length > 0);
		close();
		assert.deepStrictEqual(fake.live(), []);
	});

	test('leaves no timer behind and scans no more', async () => {
		const { close } = start();
		await vi.advanceTimersByTimeAsync(0);
		assert.strictEqual(vi.getTimerCount(), 1);
		close();
		assert.strictEqual(vi.getTimerCount(), 0);
		await vi.advanceTimersByTimeAsync(60_000);
		assert.strictEqual(adapterState.scans, 1);
	});

	test('ignores a window that changes focus afterwards', async () => {
		const { close } = start();
		close();
		const scansAtClose = adapterState.scans;
		fake.setWindowFocused(false);
		fake.setWindowFocused(true);
		await vi.advanceTimersByTimeAsync(10_000);
		assert.strictEqual(adapterState.scans, scansAtClose);
	});
});
