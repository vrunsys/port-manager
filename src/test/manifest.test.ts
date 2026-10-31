import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import {
	DEFAULT_SETTINGS,
	MAX_REFRESH_INTERVAL_SECONDS,
	MIN_REFRESH_INTERVAL_SECONDS,
	SETTING,
	SETTINGS_SECTION,
} from '../features/ports/settings/port-settings';
import { FILTER_ACTIVE_CONTEXT, ITEM_COMMAND, REFRESH_COMMAND, RUNNING_ONLY_CONTEXT, VIEW_COMMAND } from '../features/ports/view/view-constants';

const COMMAND_IDS = [REFRESH_COMMAND, ...Object.values(VIEW_COMMAND), ...Object.values(ITEM_COMMAND)];

interface Manifest {
	extensionKind?: string[];
	activationEvents?: string[];
	dependencies?: Record<string, string>;
	devDependencies?: Record<string, string>;
	contributes: {
		commands: Array<{ command: string }>;
		menus: Record<string, Array<{ command: string; when?: string; group?: string }>>;
		configuration: { properties: Record<string, { default: unknown; minimum?: number; maximum?: number; scope?: string }> };
	};
}

const manifest: Manifest = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../package.json'), 'utf8'));

suite('package.json manifest', () => {
	test('runs in the workspace extension host so Remote/WSL/containers show the remote ports (docs/remote-and-wsl.md)', () => {
		assert.deepStrictEqual(manifest.extensionKind, ['workspace']);
	});

	test('starts when VS Code has finished starting, so the status bar item is there without opening the view', () => {
		assert.ok(manifest.activationEvents?.includes('onStartupFinished'));
	});

	test('keeps the three safety settings out of workspace settings, so a cloned repository cannot switch them off', () => {
		const properties = manifest.contributes.configuration.properties;
		for (const setting of ['confirmBeforeKill', 'protectedPorts', 'protectedProcesses']) {
			assert.strictEqual(properties[`portManager.${setting}`]?.scope, 'machine-overridable', setting);
		}
	});

	test('does not ship the packaging tool: @vscode/vsce is not a runtime dependency', () => {
		assert.strictEqual(manifest.dependencies?.['@vscode/vsce'], undefined);
	});

	test('declares every command that the code registers, and every menu entry points at one', () => {
		const declared = manifest.contributes.commands.map(entry => entry.command);
		for (const id of COMMAND_IDS) {
			assert.ok(declared.includes(id), `${id} is not declared`);
		}
		for (const [menu, entries] of Object.entries(manifest.contributes.menus)) {
			for (const { command } of entries) {
				assert.ok(declared.includes(command), `${menu} refers to undeclared ${command}`);
			}
		}
	});

	test('shows the clear-search button only while a search is active', () => {
		const menus = manifest.contributes.menus;
		const inTitleBar = menus['view/title'].find(entry => entry.command === VIEW_COMMAND.clearFilter);
		assert.match(inTitleBar?.when ?? '', new RegExp(FILTER_ACTIVE_CONTEXT.replace('.', '\\.')));
	});

	test('offers "show running only" and "show all" in the same slot, one at a time', () => {
		const titleBar = manifest.contributes.menus['view/title'];
		const on = titleBar.find(entry => entry.command === VIEW_COMMAND.showRunningOnly);
		const off = titleBar.find(entry => entry.command === VIEW_COMMAND.showAllPorts);
		assert.strictEqual(on?.group, off?.group);
		assert.match(on?.when ?? '', new RegExp(`!${RUNNING_ONLY_CONTEXT.replace('.', '\\.')}`));
		assert.doesNotMatch(off?.when ?? '', /!/);
		assert.match(off?.when ?? '', new RegExp(RUNNING_ONLY_CONTEXT.replace('.', '\\.')));
	});

	test('puts rename, open and stop on every row as inline buttons, in that order', () => {
		const inline = manifest.contributes.menus['view/item/context']
			.filter(entry => entry.group?.startsWith('inline@'))
			.sort((a, b) => a.group!.localeCompare(b.group!))
			.map(entry => entry.command);
		assert.deepStrictEqual(inline, [ITEM_COMMAND.rename, ITEM_COMMAND.openInBrowser, ITEM_COMMAND.kill]);
	});

	test('contributes exactly the settings the code reads, with the defaults the code assumes', () => {
		const properties = manifest.contributes.configuration.properties;
		const keys = Object.values(SETTING).map(key => `${SETTINGS_SECTION}.${key}`);
		assert.deepStrictEqual(Object.keys(properties).sort(), keys.sort());
		assert.strictEqual(Number(properties['portManager.refreshInterval'].default) * 1000, DEFAULT_SETTINGS.refreshIntervalMs);
		assert.strictEqual(properties['portManager.confirmBeforeKill'].default, DEFAULT_SETTINGS.confirmBeforeKill);
		assert.deepStrictEqual(properties['portManager.protectedPorts'].default, DEFAULT_SETTINGS.protectedPorts);
		assert.deepStrictEqual(properties['portManager.protectedProcesses'].default, DEFAULT_SETTINGS.protectedProcesses);
		assert.strictEqual(properties['portManager.showStatusBar'].default, DEFAULT_SETTINGS.showStatusBar);
	});

	test('keeps the refresh interval range in step with the code', () => {
		const interval = manifest.contributes.configuration.properties['portManager.refreshInterval'];
		assert.strictEqual(interval.minimum, MIN_REFRESH_INTERVAL_SECONDS);
		assert.strictEqual(interval.maximum, MAX_REFRESH_INTERVAL_SECONDS);
	});
});
