import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

const EVIDENCE_DIR = '/tmp/poly-mvp-evidence';
const CREDS_PATH = path.join(process.cwd(), '.wrangler', 'poly-local-demo-credentials.json');

test('Founder local SYNTHETIC_ONLY browser workflow — login, trade, accounting, reload persistence', async ({ page }) => {
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  const creds = JSON.parse(fs.readFileSync(CREDS_PATH, 'utf8')) as { email: string; password: string };

  await page.goto('/', { waitUntil: 'networkidle' });

  // Switch to Login tab if signup is shown first, then authenticate via real local Worker
  const loginTab = page.getByRole('button', { name: /log in|sign in/i }).first();
  if (await loginTab.isVisible()) {
    await loginTab.click();
  }
  await page.locator('input[type="email"]').fill(creds.email);
  await page.locator('input[type="password"]').fill(creds.password);
  await page.locator('button[type="submit"]').click();

  // Wait for authenticated dashboard
  await expect(page.getByTestId('engine-state-badge')).toBeVisible({ timeout: 15_000 });
  await page.screenshot({ path: path.join(EVIDENCE_DIR, '01-authenticated-dashboard.png'), fullPage: true });

  // Select synthetic market and Maker strategy
  await page.getByTestId('market-select').selectOption('syn-fed-rate-cut-q4');
  await page.getByTestId('strategy-select').selectOption('toxicity-aware-mm-paper');
  await page.screenshot({ path: path.join(EVIDENCE_DIR, '02-market-and-strategy.png'), fullPage: true });

  // Click Start -> real paper engine places synthetic order & fill
  await page.getByTestId('strategy-start-btn').click();
  await expect(page.getByTestId('engine-state-badge')).toHaveText('RUNNING', { timeout: 10_000 });
  await page.screenshot({ path: path.join(EVIDENCE_DIR, '03-strategy-running.png'), fullPage: true });

  // Stop strategy cleanly
  await page.getByTestId('strategy-stop-btn').click();
  await expect(page.getByTestId('engine-state-badge')).toHaveText('STOPPED', { timeout: 10_000 });

  // Capture ledger & portfolio PnL screenshots
  await page.screenshot({ path: path.join(EVIDENCE_DIR, '04-order-fill-ledger.png'), fullPage: true });
  await page.screenshot({ path: path.join(EVIDENCE_DIR, '05-portfolio-pnl.png'), fullPage: true });

  // Fetch actual persisted portfolio from live Worker via browser session
  const portfolio = await page.evaluate(async () => {
    const res = await fetch('/api/beta/portfolio', { credentials: 'include' });
    return res.json();
  });
  fs.writeFileSync(path.join(EVIDENCE_DIR, 'live-portfolio.json'), JSON.stringify(portfolio, null, 2));

  expect(portfolio.summary.initialCapitalUsd).toBe(100);
  expect(portfolio.orders.length).toBeGreaterThanOrEqual(1);
  expect(portfolio.fills.length).toBeGreaterThanOrEqual(1);
  expect(portfolio.summary.cashBalanceUsd).toBeLessThan(100);
  expect(portfolio.summary.feesPaidUsd).toBeGreaterThan(0);

  // Refresh page and verify persisted state
  await page.reload({ waitUntil: 'networkidle' });
  await expect(page.getByTestId('engine-state-badge')).toHaveText('STOPPED', { timeout: 10_000 });
  await page.screenshot({ path: path.join(EVIDENCE_DIR, '07-persisted-state-after-restart.png'), fullPage: true });
});
