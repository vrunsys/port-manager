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
import { ITEM_COMMAND, REFRESH_COMMAND } from '../features/ports/view/view-constants';

const COMMAND_IDS = [REFRESH_COMMAND, ...Object.values(ITEM_COMMAND)];

interface Manifest {
	extensionKind?: string[];
	contributes: {
		commands: Array<{ command: string }>;
		menus: Record<string, Array<{ command: string }>>;
		configuration: { properties: Record<string, { default: unknown; minimum?: number; maximum?: number }> };
	};
}

// Tests run from the project root, both with `npm test` and with mocha directly.
const manifest: Manifest = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8'));

suite('package.json manifest', () => {
	test('runs in the workspace extension host so Remote/WSL/containers show the remote ports (docs/remote-and-wsl.md)', () => {
		assert.deepStrictEqual(manifest.extensionKind, ['workspace']);
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
