import { Emitter } from '../../../shared/emitter';
import { errorMessage } from '../../../shared/error-message';
import { logger } from '../../../shared/logger';
import { failed, notFound } from '../kill/kill-results';
import { KillOptions, KillResult, PlatformAdapter, PortInfo } from '../port-types';
import { PortsError, toPortsError } from './port-errors';
import { dedupePorts, portListsEqual } from './port-list';

const DEFAULT_INTERVAL_MS = 2000;
/** Each scan starts several processes, so polling faster than this only wastes work. */
export const MIN_INTERVAL_MS = 500;
/** The wait between scans is at least this many times the last scan's duration, so a slow tool is not hammered. */
const SLOW_SCAN_FACTOR = 4;

export interface PortsState {
	ports: readonly PortInfo[];
	/** False until the first scan has finished, successfully or not. */
	loaded: boolean;
	/** Set when the latest scan failed; `ports` then holds the last successful result. */
	error: PortsError | undefined;
}

export interface Scheduler {
	setTimeout(callback: () => void, ms: number): unknown;
	clearTimeout(handle: unknown): void;
}

export interface PortsServiceOptions {
	intervalMs?: number;
	scheduler?: Scheduler;
	/** Milliseconds clock, for measuring how long a scan takes. */
	now?: () => number;
	/** Why a process must not be stopped, or undefined if it may be. Checked again right before every kill. */
	killPolicy?: (info: PortInfo) => string | undefined;
}

type Listener = (state: PortsState) => void;

const systemScheduler: Scheduler = {
	setTimeout: (callback, ms) => setTimeout(callback, ms),
	clearTimeout: handle => clearTimeout(handle as NodeJS.Timeout),
};

function clampInterval(ms: number): number {
	return Number.isFinite(ms) ? Math.max(ms, MIN_INTERVAL_MS) : DEFAULT_INTERVAL_MS;
}

function statesEqual(a: PortsState, b: PortsState): boolean {
	return (
		a.loaded === b.loaded &&
		a.error?.kind === b.error?.kind &&
		a.error?.message === b.error?.message &&
		portListsEqual(a.ports, b.ports)
	);
}

/**
 * Keeps an up-to-date, deduplicated list of listening ports.
 * Scans never overlap, results are cached in `state`, and listeners hear about real changes only.
 */
export class PortsService {
	private current: PortsState = { ports: [], loaded: false, error: undefined };
	private readonly changes = new Emitter<PortsState>();
	private readonly scheduler: Scheduler;
	private readonly now: () => number;
	private readonly killPolicy: (info: PortInfo) => string | undefined;
	private intervalMs: number;
	private lastScanMs = 0;
	private timer: unknown;
	private inFlight: Promise<void> | undefined;
	private polling = false;
	private disposed = false;

	constructor(
		private readonly adapter: PlatformAdapter,
		options: PortsServiceOptions = {},
	) {
		this.intervalMs = clampInterval(options.intervalMs ?? DEFAULT_INTERVAL_MS);
		this.scheduler = options.scheduler ?? systemScheduler;
		this.now = options.now ?? Date.now;
		this.killPolicy = options.killPolicy ?? (() => undefined);
	}

	get state(): PortsState {
		return this.current;
	}

	onDidChange(listener: Listener): { dispose(): void } {
		return this.changes.listen(listener);
	}

	/** Turn polling on while something shows the ports and the window is in use, and off otherwise. */
	setPollingEnabled(enabled: boolean): void {
		if (this.disposed || enabled === this.polling) {
			return;
		}
		this.polling = enabled;
		if (enabled) {
			void this.refresh();
		} else {
			this.clearTimer();
		}
	}

	setIntervalMs(ms: number): void {
		this.intervalMs = clampInterval(ms);
		if (this.timer !== undefined) {
			this.clearTimer();
			this.scheduleNext();
		}
	}

	/** Starts a scan unless one is already running, in which case it waits for that one. Never rejects. */
	refresh(): Promise<void> {
		if (this.disposed) {
			return Promise.resolve();
		}
		this.inFlight ??= this.scan().finally(() => {
			this.inFlight = undefined;
		});
		return this.inFlight;
	}

	/**
	 * Stops the process that holds `target`, but only after checking, with a scan that starts now, that it still
	 * holds that port with the same command (a recycled PID would otherwise hit an unrelated process) and that the
	 * kill policy still allows it. The list is rescanned afterwards whatever the outcome.
	 */
	async killPort(target: PortInfo, options?: KillOptions): Promise<KillResult> {
		const { pid } = target;
		if (pid === undefined) {
			return failed(`Port ${target.port} has no known process to stop.`);
		}
		await this.scanFresh();
		const refusal = this.verifyTarget(target, pid);
		if (refusal) {
			return refusal;
		}
		try {
			return await this.adapter.killProcess(pid, options);
		} finally {
			await this.scanFresh();
		}
	}

	dispose(): void {
		this.disposed = true;
		this.polling = false;
		this.clearTimer();
		this.changes.clear();
	}

	private verifyTarget(target: PortInfo, pid: number): KillResult | undefined {
		if (this.current.error) {
			return failed(`Could not confirm that process ${pid} still holds port ${target.port}, so nothing was stopped: ${this.current.error.message}`);
		}
		const found = this.current.ports.find(
			info => info.protocol === target.protocol && info.port === target.port && info.pid === pid,
		);
		if (!found) {
			return notFound(pid);
		}
		if (target.command !== undefined && found.command !== undefined && target.command !== found.command) {
			logger.warn(`Refused to stop process ${pid}: its command changed from "${target.command}" to "${found.command}".`);
			return failed(`Process ${pid} now runs a different command than the one you chose, so nothing was stopped.`);
		}
		const blocked = this.killPolicy(found);
		return blocked ? failed(`Refusing to stop process ${pid}: ${blocked}.`) : undefined;
	}

	/** A scan that starts after any scan already running has finished, so its answer is not older than the call. */
	private async scanFresh(): Promise<void> {
		await this.inFlight;
		await this.refresh();
	}

	private async scan(): Promise<void> {
		// The next scan is timed from the end of this one, so they can never pile up.
		this.clearTimer();
		const started = this.now();
		let next: PortsState;
		try {
			next = { ports: dedupePorts(await this.adapter.listPorts()), loaded: true, error: undefined };
		} catch (error) {
			next = { ports: this.current.ports, loaded: true, error: toPortsError(error) };
			logger.warn(`Listing ports failed: ${errorMessage(error)}`);
		}
		this.lastScanMs = this.now() - started;
		if (this.disposed) {
			return;
		}
		this.publish(next);
		this.scheduleNext();
	}

	private publish(next: PortsState): void {
		if (statesEqual(this.current, next)) {
			return;
		}
		this.current = next;
		this.changes.fire(next);
	}

	private scheduleNext(): void {
		if (!this.polling || this.disposed) {
			return;
		}
		const delay = Math.max(this.intervalMs, this.lastScanMs * SLOW_SCAN_FACTOR);
		this.timer = this.scheduler.setTimeout(() => {
			this.timer = undefined;
			void this.refresh();
		}, delay);
	}

	private clearTimer(): void {
		if (this.timer !== undefined) {
			this.scheduler.clearTimeout(this.timer);
			this.timer = undefined;
		}
	}
}
