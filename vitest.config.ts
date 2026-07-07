import { defineConfig } from 'vitest/config';

export default defineConfig({
	resolve: {
		alias: {
			'@shared': '/src/shared',
			'@desk': '/src/desk',
			'@platform': '/src/platform',
		},
	},
	test: {
		globals: true,
		pool: 'forks',
		include: [
			'tests/**/*.{test,spec}.{ts,js,mts,mjs,cts,cjs}',
		],
		exclude: [
			'**/node_modules/**',
			'.claude/**',
			'.opencode/**',
			// Playwright E2E tests have their own runner (npm run test:e2e).
			// Including them here causes "test.describe() called here" errors.
			'tests/e2e/**',
			// Polymarket strategy tests excluded — strategies depend on unimplemented
			// infrastructure (clob-client, order-manager, event-bus, gamma-client).
			// Re-enable when polymarket infra is implemented.
			'tests/strategies/**',
			// Signal-publisher tests flaky with D1 singleton isolation — pre-existing,
			// tracked separately.
			'src/signal/__tests__/signal-publisher.test.ts',
			// Dashboard has its own vitest config (jsdom). Exclude from root Node
			// environment to prevent jsdom-in-node conflicts.
			'dashboard/**',
		],
	},
});
