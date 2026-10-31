import { PortInfo } from '../../port-types';
import { isValidPort } from '../../../../shared/port-number';

const BYTE_ORDER_MARK = /^﻿/;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

function nonEmptyString(value: unknown): string | undefined {
	return typeof value === 'string' && value !== '' ? value : undefined;
}

function toPortInfo(entry: unknown): PortInfo | undefined {
	if (!isRecord(entry)) {
		return undefined;
	}
	const address = nonEmptyString(entry.Address);
	if (!isValidPort(entry.Port) || address === undefined) {
		return undefined;
	}
	const command = nonEmptyString(entry.Path);
	return {
		port: entry.Port,
		protocol: 'tcp',
		// Link-local addresses carry a zone id ("fe80::1%12").
		address: address.replace(/%.*$/, ''),
		pid: Number.isInteger(entry.Pid) ? (entry.Pid as number) : undefined,
		processName: nonEmptyString(entry.ProcessName),
		user: undefined,
		...(command && { command }),
	};
}

/**
 * Parses the JSON printed by the PowerShell script. ConvertTo-Json prints a bare object
 * (not an array) for a single result, and nothing at all for none.
 */
export function parsePowerShellPorts(output: string): PortInfo[] {
	const text = output.replace(BYTE_ORDER_MARK, '').trim();
	if (text === '') {
		return [];
	}
	let data: unknown;
	try {
		data = JSON.parse(text);
	} catch {
		throw new Error('PowerShell did not return valid JSON.');
	}
	const entries: unknown[] = Array.isArray(data) ? data : [data];
	return entries.flatMap(entry => toPortInfo(entry) ?? []);
}
