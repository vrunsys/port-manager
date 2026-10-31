import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Plain Node tests: nothing here needs VS Code or any OS-specific tool.
export default defineConfig({
	resolve: {
		// Code that imports "vscode" gets a recording stand-in, so the glue can be tested without VS Code.
		alias: { vscode: fileURLToPath(new URL('./src/test/fakes/vscode.ts', import.meta.url)) },
	},
	test: {
		include: ['src/test/**/*.test.ts'],
		globals: true,
		environment: 'node',
	},
});
