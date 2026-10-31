const IMAGE_NAME_COLUMN = 0;
const PID_COLUMN = 1;

/** Splits one CSV line, honouring quotes and doubled quotes ("12,488 K" stays one field). */
function splitCsvLine(line: string): string[] {
	const fields: string[] = [];
	let field = '';
	let quoted = false;
	for (let i = 0; i < line.length; i++) {
		const char = line[i];
		if (char === '"') {
			if (quoted && line[i + 1] === '"') {
				field += '"';
				i++;
			} else {
				quoted = !quoted;
			}
		} else if (char === ',' && !quoted) {
			fields.push(field);
			field = '';
		} else {
			field += char;
		}
	}
	fields.push(field);
	return fields;
}

/**
 * Parses `tasklist /FO CSV /NH` into a PID -> image name map. The header row is
 * localized, so it is not requested (/NH) and columns are read by position.
 */
export function parseTasklistCsv(output: string): Map<number, string> {
	const names = new Map<number, string>();
	for (const line of output.split('\n')) {
		const fields = splitCsvLine(line.trim());
		const pid = Number(fields[PID_COLUMN]);
		if (fields.length > PID_COLUMN && Number.isInteger(pid)) {
			names.set(pid, fields[IMAGE_NAME_COLUMN]);
		}
	}
	return names;
}
