import { defineConfig } from 'vitest/config';

// Runs against the real operating system: real port-listing tools, real processes.
// Kept apart from `npm test`, which needs no OS tools. A cold PowerShell start can take seconds.
export default defineConfig({
	test: {
		include: ['src/integration/**/*.integration.test.ts'],
		globals: true,
		environment: 'node',
		testTimeout: 60_000,
		hookTimeout: 60_000,
	},
});
