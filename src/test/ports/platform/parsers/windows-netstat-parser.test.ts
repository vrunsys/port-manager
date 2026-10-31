import * as assert from 'assert';
import { parseWindowsNetstat } from '../../../../features/ports/platform/parsers/windows-netstat-parser';
import { windows } from '../../../fixtures/load-fixtures';
import { portsAndPids } from '../../../helpers/rows';

suite('parseWindowsNetstat (English sample)', () => {
	const ports = parseWindowsNetstat(windows.netstat.en);

	test('finds every listening TCP row, IPv4 and IPv6, and nothing else', () => {
		assert.deepStrictEqual(portsAndPids(ports), [
			[135, '0.0.0.0', 1032],
			[445, '0.0.0.0', 4],
			[3001, '127.0.0.1', 5521],
			[139, '192.168.1.5', 4],
			[135, '::', 1032],
			[3000, '::', 5521],
			[49664, '::1', 936],
		]);
	});

	test('skips established connections and UDP rows', () => {
		assert.ok(!ports.some(p => p.port === 50123 || p.port === 5353));
	});

	test('leaves the process name unknown until tasklist is joined', () => {
		assert.ok(ports.every(p => p.processName === undefined));
	});

	test('returns nothing for empty output', () => {
		assert.deepStrictEqual(parseWindowsNetstat(''), []);
	});
});

suite('parseWindowsNetstat (non-English output)', () => {
	test('finds the listening rows in German without matching the state word', () => {
		const ports = parseWindowsNetstat(windows.netstat.de);
		assert.deepStrictEqual(portsAndPids(ports), [[135, '0.0.0.0', 1032], [3000, '0.0.0.0', 5521], [135, '::', 1032]]);
	});

	test('finds them in French, with accented headers and states', () => {
		const ports = parseWindowsNetstat(windows.netstat.fr);
		assert.deepStrictEqual(portsAndPids(ports), [[135, '0.0.0.0', 1032], [3000, '0.0.0.0', 5521], [135, '::', 1032]]);
	});

	test('finds them in Russian, where headers and states are Cyrillic', () => {
		const ports = parseWindowsNetstat(windows.netstat.ru);
		assert.deepStrictEqual(portsAndPids(ports), [
			[135, '0.0.0.0', 1032],
			[3000, '0.0.0.0', 5521],
			[8080, '0.0.0.0', 6001],
			[135, '::', 1032],
		]);
	});

	test('finds them in Italian, where the "listening" label is two words', () => {
		const ports = parseWindowsNetstat(windows.netstat.it);
		assert.deepStrictEqual(portsAndPids(ports), [[135, '0.0.0.0', 1032], [3000, '0.0.0.0', 5521], [135, '::', 1032]]);
	});

	test('never counts a connection to a remote host as a listener, in any language', () => {
		for (const [language, output] of Object.entries(windows.netstat)) {
			assert.ok(!parseWindowsNetstat(output).some(p => p.port === 50123), language);
		}
	});
});
