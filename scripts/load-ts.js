// Lets the helper scripts reuse the extension's TypeScript modules without a separate compile step.
const esbuild = require('esbuild');
const fs = require('fs');
const os = require('os');
const path = require('path');

const PROJECT_ROOT = path.join(__dirname, '..');

/** Bundles a project TypeScript file into a temporary CommonJS module and returns its exports. */
function loadTs(relativePath) {
	const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'port-manager-'));
	const outfile = path.join(outDir, 'module.js');
	esbuild.buildSync({
		entryPoints: [path.join(PROJECT_ROOT, relativePath)],
		bundle: true,
		platform: 'node',
		format: 'cjs',
		outfile,
		logLevel: 'silent',
	});
	return require(outfile);
}

module.exports = { loadTs };
