import * as assert from 'assert';
import {
	buildPortTooltip,
	describeListMessage,
	describeStatusBar,
	describeViewMessage,
	EMPTY_MESSAGE,
	formatPortDescription,
	formatPortLabel,
	SCANNING_MESSAGE,
} from '../../../features/ports/view/port-formatting';
import { PortInfo } from '../../../features/ports/port-types';
import { PortsState } from '../../../features/ports/service/ports-service';

function port(overrides: Partial<PortInfo> = {}): PortInfo {
	return { port: 3000, protocol: 'tcp', address: '127.0.0.1', pid: 100, processName: 'node', user: 'varun', ...overrides };
}

const hidden = port({ pid: undefined, processName: undefined, user: undefined });

suite('port row text', () => {
	test('label is the port number', () => {
		assert.strictEqual(formatPortLabel(port({ port: 8080 })), '8080');
	});

	test('description shows protocol, process, PID and user', () => {
		assert.strictEqual(formatPortDescription(port()), 'tcp · node · PID 100 · varun');
	});

	test('description leaves out an unknown user', () => {
		assert.strictEqual(formatPortDescription(port({ user: undefined })), 'tcp · node · PID 100');
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

	test('shows the name you gave the port', () => {
		assert.match(buildPortTooltip(port(), undefined, 'frontend'), /Name: ` frontend `/);
		assert.doesNotMatch(buildPortTooltip(port()), /Name:/);
	});

	test('says why a port is protected', () => {
		const tooltip = buildPortTooltip(port(), 'port 3000 is listed in portManager.protectedPorts');
		assert.match(tooltip, /\*\*Protected:\*\* port 3000 is listed in portManager\.protectedPorts\./);
		assert.doesNotMatch(buildPortTooltip(port()), /Protected/);
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

suite('describeListMessage', () => {
	const loaded = (ports: PortInfo[] = [port()]): PortsState => ({ ports, loaded: true, error: undefined });
	const counts = (overrides: Partial<{ inScope: number; shown: number; hidden: number; query: string }> = {}) => ({
		inScope: 1,
		shown: 1,
		hidden: 0,
		query: '',
		...overrides,
	});

	test('says nothing when the list speaks for itself', () => {
		assert.strictEqual(describeListMessage(loaded(), counts()), undefined);
	});

	test('explains an empty list when running only hides every row', () => {
		const message = describeListMessage(loaded([hidden]), counts({ inScope: 0, shown: 0, hidden: 1 }));
		assert.match(message ?? '', /Nothing running that Port Manager can identify\. 1 port has a hidden process and is not shown\./);
		assert.match(describeListMessage(loaded([hidden, hidden]), counts({ inScope: 0, shown: 0, hidden: 2 })) ?? '', /2 ports have a hidden process and are not shown/);
	});

	test('says nothing matches the search, with the search text trimmed', () => {
		assert.strictEqual(describeListMessage(loaded(), counts({ shown: 0, query: '  zzz ' })), 'No ports match “zzz”.');
	});

	test('falls back to the empty and error messages when there is nothing hidden', () => {
		assert.strictEqual(describeListMessage(loaded([]), counts({ inScope: 0, shown: 0 })), EMPTY_MESSAGE);
		assert.strictEqual(describeListMessage({ ports: [], loaded: false, error: undefined }, counts({ inScope: 0, shown: 0 })), SCANNING_MESSAGE);
	});

	test('shows a loading error even while rows are hidden by the search', () => {
		const failing: PortsState = { ports: [port()], loaded: true, error: { kind: 'timeout', message: 'ss did not finish.' } };
		assert.match(describeListMessage(failing, counts()) ?? '', /^Timed out\./);
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

	test('with running only on, counts only the rows the list shows and says so', () => {
		const withHidden = state({ ports: [port(), port({ port: 1 }), hidden] });
		assert.strictEqual(describeStatusBar(withHidden, false).text, '$(plug) 3');
		const view = describeStatusBar(withHidden, true);
		assert.strictEqual(view.text, '$(plug) 2');
		assert.match(view.tooltip, /^2 listening ports \(running only\)\./);
	});

	test('always counts the same rows the tree shows', () => {
		for (const ports of [[], [port()], [port(), port({ port: 1 }), hidden]]) {
			const count = describeStatusBar(state({ ports })).text.replace('$(plug) ', '');
			assert.strictEqual(count, String(ports.length));
		}
	});
});
