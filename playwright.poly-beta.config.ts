import { defineConfig, devices } from '@playwright/test';
import { existsSync } from 'node:fs';

const envChromiumExecutable = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
const launchOptions =
  envChromiumExecutable && existsSync(envChromiumExecutable)
    ? { executablePath: envChromiumExecutable }
    : undefined;

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: 'poly-beta-first-user.spec.ts',
  fullyParallel: false,
  retries: 0,
  workers: 1,
  timeout: 60_000,
  use: {
    ...(process.env.POLY_BETA_URL ? { baseURL: process.env.POLY_BETA_URL } : {}),
    trace: 'off',
    ...(launchOptions ? { launchOptions } : {}),
  },
  projects: [
    {
      name: 'Desktop-Chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'Mobile-Pixel5',
      use: { ...devices['Pixel 5'] },
    },
  ],
});
