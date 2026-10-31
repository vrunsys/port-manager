import { PortsService } from './ports-service';

type PollingReason = 'view' | 'status-bar';

/**
 * Polling is only worth its cost while something on screen shows the result AND the window is in use:
 * an unfocused or minimized window needs no fresh data, and gets a scan the moment it is focused again.
 */
export class PollingDemand {
	private readonly active = new Set<PollingReason>();
	private windowFocused = true;

	constructor(private readonly service: Pick<PortsService, 'setPollingEnabled'>) {}

	set(reason: PollingReason, wanted: boolean): void {
		if (wanted) {
			this.active.add(reason);
		} else {
			this.active.delete(reason);
		}
		this.apply();
	}

	setWindowFocused(focused: boolean): void {
		this.windowFocused = focused;
		this.apply();
	}

	private apply(): void {
		this.service.setPollingEnabled(this.windowFocused && this.active.size > 0);
	}
}
