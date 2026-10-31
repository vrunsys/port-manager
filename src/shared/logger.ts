/** Where log lines go; the extension points this at an Output channel. */
export interface LogSink {
	info(message: string): void;
	warn(message: string): void;
	error(message: string): void;
}

let sink: LogSink | undefined;

/** Sets (or, with undefined, clears) the destination. Until one is set, log lines are dropped. */
export function setLogSink(next: LogSink | undefined): void {
	sink = next;
}

export const logger: LogSink = {
	info: message => sink?.info(message),
	warn: message => sink?.warn(message),
	error: message => sink?.error(message),
};
