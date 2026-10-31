import * as assert from 'assert';
import {
	buildPortTooltip,
	describeStatusBar,
	describeViewMessage,
	EMPTY_MESSAGE,
	formatPortDescription,
	formatPortLabel,
	SCANNING_MESSAGE,
} from '../features/ports/port-formatting';
import { PortInfo, UNKNOWN_LABEL } from '../features/ports/port-types';
import { PortsState } from '../features/ports/ports-service';
import { UnsupportedAdapter } from '../features/ports/unsupported-adapter';

function port(overrides: Partial<PortInfo> = {}): PortInfo {
	return { port: 3000, protocol: 'tcp', address: '127.0.0.1', pid: 100, processName: 'node', user: 'varun', ...overrides };
}

const hidden = port({ pid: undefined, processName: UNKNOWN_LABEL, user: UNKNOWN_LABEL });

suite('port row text', () => {
	test('label is the port number', () => {
		assert.strictEqual(formatPortLabel(port({ port: 8080 })), '8080');
	});

	test('description shows protocol, process, PID and user', () => {
		assert.strictEqual(formatPortDescription(port()), 'tcp · node · PID 100 · varun');
	});

	test('description leaves out an unknown user', () => {
		assert.strictEqual(formatPortDescription(port({ user: UNKNOWN_LABEL })), 'tcp · node · PID 100');
	});

	test('description says the process is hidden when there is no PID', () => {
		assert.strictEqual(formatPortDescription(hidden), 'tcp · process hidden');
	});
});

suite('buildPortTooltip', () => {
	test('includes address, process, user and the full command', () => {
		const tooltip = buildPortTooltip(port({ command: 'node server.js --port 3000', cwd: '/srv/app' }));
		assert.match(tooltip, /\*\*Port 3000\*\* \(tcp\)/);
		assert.match(tooltip, /Address: ` 127\.0\.0\.1 `/);
		assert.match(tooltip, /node \(PID 100\)/);
		assert.match(tooltip, /User: ` varun `/);
		assert.match(tooltip, /```\nnode server\.js --port 3000\n```/);
		assert.match(tooltip, /Working directory: ` \/srv\/app `/);
	});

	test('omits the command and directory when unknown', () => {
		const tooltip = buildPortTooltip(port());
		assert.doesNotMatch(tooltip, /Command/);
		assert.doesNotMatch(tooltip, /Working directory/);
	});

	test('explains a hidden process', () => {
		const tooltip = buildPortTooltip(hidden);
		assert.match(tooltip, /hidden/);
		assert.doesNotMatch(tooltip, /User:/);
	});

	test('uses a longer fence when the command contains backticks', () => {
		const tooltip = buildPortTooltip(port({ command: 'sh -c "echo ```"' }));
		assert.match(tooltip, /````\nsh -c "echo ```"\n````/);
	});
});

suite('describeViewMessage', () => {
	const loaded = (overrides: Partial<PortsState>): PortsState => ({
		ports: [port()],
		loaded: true,
		error: undefined,
		...overrides,
	});

	test('says it is scanning before the first scan finishes', () => {
		assert.strictEqual(describeViewMessage({ ports: [], loaded: false, error: undefined }), SCANNING_MESSAGE);
	});

	test('shows the empty state when there are no ports', () => {
		assert.strictEqual(describeViewMessage(loaded({ ports: [] })), EMPTY_MESSAGE);
	});

	test('shows nothing when ports are listed', () => {
		assert.strictEqual(describeViewMessage(loaded({})), undefined);
	});

	test('shows a tool-missing error', () => {
		const message = describeViewMessage(
			loaded({ ports: [], error: { kind: 'tool-missing', message: 'none of ss, lsof, netstat is installed.' } }),
		);
		assert.strictEqual(message, 'Tool missing. none of ss, lsof, netstat is installed.');
	});

	test('shows a permission-denied error', () => {
		const message = describeViewMessage(
			loaded({ ports: [], error: { kind: 'permission-denied', message: 'Access is denied.' } }),
		);
		assert.strictEqual(message, 'Permission denied. Access is denied.');
	});

	test('mentions the last known list when an error leaves stale ports', () => {
		const message = describeViewMessage(loaded({ error: { kind: 'timeout', message: 'ss did not finish.' } }));
		assert.strictEqual(message, 'Timed out. ss did not finish. Showing the last known list.');
	});
});

suite('describeStatusBar', () => {
	const state = (overrides: Partial<PortsState> = {}): PortsState => ({
		ports: [port(), port({ port: 4000 })],
		loaded: true,
		error: undefined,
		...overrides,
	});

	test('shows the plug icon and the number of ports', () => {
		const view = describeStatusBar(state());
		assert.strictEqual(view.text, '$(plug) 2');
		assert.strictEqual(view.tooltip, '2 listening ports. Click to open Port Manager.');
		assert.strictEqual(view.warning, false);
	});

	test('uses the singular for one port and shows zero for none', () => {
		assert.match(describeStatusBar(state({ ports: [port()] })).tooltip, /^1 listening port\./);
		assert.strictEqual(describeStatusBar(state({ ports: [] })).text, '$(plug) 0');
	});

	test('shows an ellipsis before the first scan has finished', () => {
		const view = describeStatusBar({ ports: [], loaded: false, error: undefined });
		assert.strictEqual(view.text, '$(plug) …');
		assert.strictEqual(view.tooltip, SCANNING_MESSAGE);
	});

	test('keeps the last known count on an error, flags a warning and explains in the tooltip', () => {
		const view = describeStatusBar(state({ error: { kind: 'timeout', message: 'ss did not finish.' } }));
		assert.strictEqual(view.text, '$(plug) 2');
		assert.strictEqual(view.warning, true);
		assert.match(view.tooltip, /^Timed out\. ss did not finish\.\n2 listening ports/);
	});

	test('always counts the same rows the tree shows', () => {
		for (const ports of [[], [port()], [port(), port({ port: 1 }), hidden]]) {
			const count = describeStatusBar(state({ ports })).text.replace('$(plug) ', '');
			assert.strictEqual(count, String(ports.length));
		}
	});
});

suite('UnsupportedAdapter', () => {
	test('reports why listing is impossible', async () => {
		const adapter = new UnsupportedAdapter(new Error('Port Manager does not support "aix" yet.'));
		await assert.rejects(adapter.listPorts(), /does not support "aix"/);
		assert.strictEqual((await adapter.killProcess()).status, 'failed');
	});
});
