import { KillResult, PlatformAdapter, PortInfo } from '../../features/ports/port-types';

export function port(overrides: Partial<PortInfo> = {}): PortInfo {
	return { port: 3000, protocol: 'tcp', address: '127.0.0.1', pid: 100, processName: 'node', user: 'varun', ...overrides };
}

/** An adapter that lists whatever `state.ports` holds, and records how often it was asked and what it was told to stop. */
export function fakeAdapter(ports: PortInfo[] = []) {
	const state = { ports, scans: 0, killed: [] as number[] };
	const adapter: PlatformAdapter = {
		listPorts: async () => {
			state.scans++;
			return state.ports;
		},
		killProcess: async (pid): Promise<KillResult> => {
			state.killed.push(pid);
			return { status: 'killed', message: `Stopped process ${pid}.` };
		},
	};
	return { adapter, state };
}
