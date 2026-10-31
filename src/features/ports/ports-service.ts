import { portListsEqual, dedupePorts } from './port-list';
import { PortsError, toPortsError } from './port-errors';
import { KillOptions, KillResult, PlatformAdapter, PortInfo } from './port-types';

export const DEFAULT_INTERVAL_MS = 2000;
/** Each scan starts several processes, so polling faster than this only wastes work. */
export const MIN_INTERVAL_MS = 500;

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
	private readonly listeners = new Set<Listener>();
	private readonly scheduler: Scheduler;
	private intervalMs: number;
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
	}

	get state(): PortsState {
		return this.current;
	}

	onDidChange(listener: Listener): { dispose(): void } {
		this.listeners.add(listener);
		return { dispose: () => void this.listeners.delete(listener) };
	}

	/** Turn polling on while the view is visible and off while it is hidden. */
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

	/** Stops a process, then rescans so the list reflects the outcome even when the kill failed. */
	async killProcess(pid: number, options?: KillOptions): Promise<KillResult> {
		try {
			return await this.adapter.killProcess(pid, options);
		} finally {
			await this.refresh();
		}
	}

	dispose(): void {
		this.disposed = true;
		this.polling = false;
		this.clearTimer();
		this.listeners.clear();
	}

	private async scan(): Promise<void> {
		// The next scan is timed from the end of this one, so they can never pile up.
		this.clearTimer();
		let next: PortsState;
		try {
			next = { ports: dedupePorts(await this.adapter.listPorts()), loaded: true, error: undefined };
		} catch (error) {
			next = { ports: this.current.ports, loaded: true, error: toPortsError(error) };
		}
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
		for (const listener of this.listeners) {
			try {
				listener(next);
			} catch (error) {
				// A broken listener must not stop polling or starve the other listeners.
				console.error('Port Manager: a change listener threw', error);
			}
		}
	}

	private scheduleNext(): void {
		if (!this.polling || this.disposed) {
			return;
		}
		this.timer = this.scheduler.setTimeout(() => {
			this.timer = undefined;
			void this.refresh();
		}, this.intervalMs);
	}

	private clearTimer(): void {
		if (this.timer !== undefined) {
			this.scheduler.clearTimeout(this.timer);
			this.timer = undefined;
		}
	}
}
