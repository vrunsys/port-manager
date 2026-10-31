import { defineConfig } from 'vitest/config';

// Plain Node tests: nothing here needs VS Code or any OS-specific tool.
export default defineConfig({
	test: {
		include: ['src/test/**/*.test.ts'],
		globals: true,
		environment: 'node',
	},
});
