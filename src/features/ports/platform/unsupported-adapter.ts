import { failed } from '../kill/kill-results';
import { KillResult, PlatformAdapter, PortInfo } from '../port-types';

/** Stands in on an OS without an adapter so the view can show the reason instead of activation failing. */
export class UnsupportedAdapter implements PlatformAdapter {
	constructor(private readonly reason: Error) {}

	listPorts(): Promise<PortInfo[]> {
		return Promise.reject(this.reason);
	}

	async killProcess(): Promise<KillResult> {
		return failed(this.reason.message);
	}
}
