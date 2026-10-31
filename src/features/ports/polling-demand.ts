import { PortsService } from './ports-service';

export type PollingReason = 'view' | 'status-bar';

/** Polling is only worth its cost while something on screen shows the result. */
export class PollingDemand {
	private readonly active = new Set<PollingReason>();

	constructor(private readonly service: Pick<PortsService, 'setPollingEnabled'>) {}

	set(reason: PollingReason, wanted: boolean): void {
		if (wanted) {
			this.active.add(reason);
		} else {
			this.active.delete(reason);
		}
		this.service.setPollingEnabled(this.active.size > 0);
	}
}
