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
      'src/**/__tests__/**/*.{test,spec}.{ts,js,mts,mjs,cts,cjs}',
    ],
    exclude: [
      '**/node_modules/**',
      '.claude/**',
      '.opencode/**',
      // Playwright E2E tests have their own runner (npm run test:e2e).
      'tests/e2e/**',
      // Polymarket strategy tests excluded
      'tests/strategies/**',
      // .claude hooks tests reference deleted fixtures
      '**/.claude/hooks/__tests__/**',
      // Signal-publisher tests flaky with D1 singleton isolation — tracked separately
      'src/signal/__tests__/signal-publisher.test.ts',
      // Dashboard has its own vitest config (jsdom)
      'dashboard/**',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'html'],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
  },
});
