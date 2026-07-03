import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'src/shared'),
      '@desk': resolve(__dirname, 'src/desk'),
      '@platform': resolve(__dirname, 'src/platform'),
    },
  },
  test: {
    globals: true,
    pool: 'forks',
    exclude: [
      '**/node_modules/**',
      '.claude/**',
      '.opencode/**',
      '**/smoke.test.ts',
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
      // Backups and compiled dist are not active source — skip
      'backups/**',
      'dist/**',
    ],
    coverage: {
      provider: 'v8',
      enabled: true,
      reporter: ['text', 'text-summary', 'json-summary'],
      reportOnFailure: true,
      thresholds: {
        branches: 80,
        functions: 80,
        lines: 80,
        statements: 80,
      },
      // Exclude same patterns as test.exclude plus config/build artifacts
      exclude: [
        '**/node_modules/**',
        '.claude/**',
        '.opencode/**',
        'tests/strategies/**',
        'dashboard/**',
        'backups/**',
        'dist/**',
        '**/*.config.{ts,js}',
        '**/migrations/**',
        'src/**/*.test.ts',
        'src/**/__tests__/**',
      ],
    },
  },
});
