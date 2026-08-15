import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@shared': '/src/shared',
      '@desk': '/src/desk',
      '@platform': '/src/platform',
    '@forest': '/src/forest',
    '@redis': '/src/redis/index',
    },
  },
  test: {
    // Inject harmless placeholders for production-only keys so server boot
    // assertions in api/server.ts don't hard-fail during unit tests.
    env: {
      JWT_SECRET: 'test-jwt-secret',
      EMAIL_PROVIDER_KEY: 'test-email-key',
      NOWPAYMENTS_API_KEY: 'test-nowpayments-key',
      AUDIT_HMAC_KEY_v1: 'a'.repeat(64),
    },
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
      'tests/strategies/polymarket/**',
      // .claude hooks tests reference deleted fixtures
      '**/.claude/hooks/__tests__/**',
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
