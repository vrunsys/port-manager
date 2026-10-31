import * as assert from 'assert';
import { parseLsof } from '../../../../features/ports/platform/parsers/lsof-parser';
import { parseNetstat } from '../../../../features/ports/platform/parsers/netstat-parser';
import { parseSs } from '../../../../features/ports/platform/parsers/ss-parser';
import { PortInfo } from '../../../../features/ports/port-types';
import { linux } from '../../../fixtures/load-fixtures';

suite('the three Linux tools describe the same machine', () => {
	/** "port:pid" of every row whose process is known. */
	const visible = (ports: PortInfo[]) =>
		new Set(ports.filter(p => p.pid !== undefined).map(p => `${p.port}:${p.pid}`));

	test('ss and netstat agree on every listener, hidden ones included', () => {
		const ss = parseSs(linux.ss);
		const netstat = parseNetstat(linux.netstat);
		assert.strictEqual(ss.length, netstat.length);
		assert.deepStrictEqual(visible(ss), visible(netstat));
		assert.deepStrictEqual(ss.map(p => p.port), netstat.map(p => p.port));
	});

	test('lsof lists exactly the listeners whose process is visible to ss', () => {
		assert.deepStrictEqual(visible(parseLsof(linux.lsofFields)), visible(parseSs(linux.ss)));
	});
});
