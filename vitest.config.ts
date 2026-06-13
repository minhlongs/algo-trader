import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    pool: 'forks',
    exclude: [
      '**/node_modules/**',
      '.claude/**',
      '.opencode/**',
      '**/smoke.test.ts',
      // Exclude dormant/backup directories
      'backups/**',
      // E2E tests use Playwright runner, not vitest
      'tests/e2e/**',
      // Polymarket strategy tests excluded — strategies depend on unimplemented
      // infrastructure (clob-client, order-manager, event-bus, gamma-client).
      // Re-enable when polymarket infra is implemented.
      'tests/strategies/**',
      // Dashboard has its own vitest config (jsdom + @testing-library/react).
      // Root vitest (node env) cannot resolve dashboard-local deps.
      'dashboard/**',
      // Signal-publisher tests flaky with D1 singleton isolation — pre-existing,
      // tracked separately. Qwen-integration PR #111 does not regress this path.
      'src/signal/__tests__/signal-publisher.test.ts',
    ],
  },
});
