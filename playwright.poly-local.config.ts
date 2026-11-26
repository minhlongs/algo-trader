import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: /poly-local-synthetic-mvp\.spec\.ts/,
  timeout: 60_000,
  retries: 0,
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:5173',
    trace: 'on',
    viewport: { width: 1440, height: 900 },
  },
  outputDir: '/tmp/poly-mvp-evidence/test-results',
});
