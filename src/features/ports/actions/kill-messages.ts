import { KillResult, PortInfo } from '../port-types';

/** The part of the editor that can show a message; port-actions' UI satisfies it. */
interface MessageSink {
	showStatus(text: string): void;
	showWarning(text: string): void;
	showError(text: string): void;
}

export function describeProcess(info: PortInfo): string {
	return `${info.processName ?? 'process'} (PID ${info.pid})`;
}

export function hiddenProcessMessage(info: PortInfo): string {
	return `Port ${info.port} belongs to a process Port Manager cannot see, so it has no PID to use.`;
}

export function protectedMessage(info: PortInfo, reason: string): string {
	return `Port ${info.port} is protected (${reason}), so Port Manager will not stop it.`;
}

/** Tells the user how to get the rights themselves; Port Manager never elevates on its own. */
function elevationHint(pid: number, platform: NodeJS.Platform): string {
	const never = 'Port Manager never raises its own privileges.';
	return platform === 'win32'
		? `This needs administrator rights. ${never} Restart VS Code with "Run as administrator", or run "taskkill /PID ${pid} /T /F" in an elevated terminal.`
		: `This needs elevated rights (sudo). ${never} Run "sudo kill ${pid}" in a terminal (add -9 if it ignores that).`;
}

export function reportKillResult(ui: MessageSink, info: PortInfo, result: KillResult, platform: NodeJS.Platform): void {
	switch (result.status) {
		case 'killed':
			ui.showStatus(`Stopped ${describeProcess(info)}.`);
			break;
		case 'not-found':
			ui.showWarning(result.message);
			break;
		case 'permission-denied':
			ui.showError(`${result.message} ${elevationHint(info.pid ?? 0, platform)}`);
			break;
		case 'failed':
			ui.showError(result.message);
			break;
	}
}
