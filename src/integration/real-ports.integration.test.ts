import * as assert from 'assert';
import { ChildProcess, spawn } from 'child_process';
import { createPlatformAdapter } from '../features/ports/platform/platform-adapter-factory';
import { PortInfo } from '../features/ports/port-types';
import { PortsService } from '../features/ports/service/ports-service';

// A throwaway server on a free loopback port; it prints the port once it is listening.
const SERVER_SCRIPT = "require('net').createServer().listen(0, '127.0.0.1', function () { console.log(this.address().port); });";
const WAIT_MS = 15_000;
const POLL_MS = 250;

interface Server {
	child: ChildProcess;
	port: number;
	exited: Promise<void>;
}

async function startServer(): Promise<Server> {
	const child = spawn(process.execPath, ['-e', SERVER_SCRIPT], { stdio: ['ignore', 'pipe', 'inherit'], windowsHide: true });
	const exited = new Promise<void>(resolve => child.once('exit', () => resolve()));
	const port = await new Promise<number>((resolve, reject) => {
		child.stdout?.once('data', data => resolve(Number(String(data).trim())));
		child.once('error', reject);
		child.once('exit', code => reject(new Error(`the test server exited early (code ${code})`)));
	});
	return { child, port, exited };
}

const describeRows = (ports: readonly PortInfo[]) =>
	ports.map(p => `${p.port}/${p.protocol} ${p.address} pid=${p.pid} ${p.processName}`).join('\n  ');

/** Polls until `check` passes, so a slow tool is not mistaken for a wrong answer; reports what it last saw. */
async function waitFor<T>(what: string, attempt: () => Promise<{ ok: boolean; value: T; seen: string }>): Promise<T> {
	const deadline = Date.now() + WAIT_MS;
	for (;;) {
		const result = await attempt();
		if (result.ok) {
			return result.value;
		}
		if (Date.now() > deadline) {
			throw new Error(`${what} (waited ${WAIT_MS} ms). Last listing:\n  ${result.seen}`);
		}
		await new Promise(resolve => setTimeout(resolve, POLL_MS));
	}
}

/** The same code path as the extension, on whatever OS runs this: list, find, kill, confirm it is gone. */
suite(`real ${process.platform} port listing and kill`, () => {
	const adapter = createPlatformAdapter();
	let server: Server | undefined;

	afterEach(() => {
		server?.child.kill('SIGKILL');
		server = undefined;
	});

	test('lists a throwaway server, finds it, kills it, and sees it disappear', async () => {
		server = await startServer();
		const { child, port } = server;
		const isServer = (p: PortInfo) => p.port === port && p.pid === child.pid;

		// 1. The platform adapter finds the server with the right owner process.
		const found = await waitFor(`port ${port} (pid ${child.pid}) was not listed by the platform adapter`, async () => {
			const ports = await adapter.listPorts();
			return { ok: ports.some(isServer), value: ports.find(isServer)!, seen: describeRows(ports) };
		});
		assert.strictEqual(found.protocol, 'tcp');
		assert.ok(['127.0.0.1', '*', '0.0.0.0'].includes(found.address), `unexpected address ${found.address}`);

		// 2. The service (dedupe + state) shows the same row.
		const service = new PortsService(adapter);
		await service.refresh();
		assert.strictEqual(service.state.error, undefined, service.state.error?.message);
		assert.ok(service.state.ports.some(isServer), `service did not list it:\n  ${describeRows(service.state.ports)}`);

		// 3. Killing it through the service reports success and rescans.
		const result = await service.killPort(found);
		assert.strictEqual(result.status, 'killed', result.message);
		await server.exited;

		// 4. The port is gone, both in the service's fresh state and in a new listing.
		assert.ok(!service.state.ports.some(isServer), 'the service still lists the killed server');
		await waitFor(`port ${port} was still listed after the kill`, async () => {
			const ports = await adapter.listPorts();
			return { ok: !ports.some(isServer), value: undefined, seen: describeRows(ports) };
		});
	});
});
