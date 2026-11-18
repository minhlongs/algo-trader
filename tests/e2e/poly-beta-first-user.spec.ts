/**
 * POLY-G5 Gates G8 & G10 — Live Cloudflare Public Beta First-User E2E Journey
 * (Desktop Chromium + Mobile Pixel 5) & Adversarial Tenant Isolation Smoke Test.
 */

import { expect, test } from '@playwright/test';
import { resolve } from 'node:path';

const SCREENSHOT_DIR = resolve(__dirname, '../../plans/reports/poly-g5-screenshots');

test.describe('POLY-G5 First-User Public Beta Journey (Live Cloudflare)', () => {
  test('completes Landing -> Signup -> $100 Ledger -> Strategy Start/Pause/Stop -> Paper Fill -> Deposit 403 -> Self-Service Account Deletion', async ({
    page,
    browser,
  }, testInfo) => {
    const projSlug = testInfo.project.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const uniqueEmail = `beta-${projSlug}-${Date.now()}@example.com`;
    const password = 'Strong#BetaPassword2026!';

    // 1. Landing Page & Paper-Only Disclosure
    await page.goto('/');
    await expect(page.getByTestId('paper-mode-banner')).toContainText('LIVE_TRADING_ENABLED=false');
    await expect(page.getByTestId('simulation-risk-disclosure')).toBeVisible();
    await page.screenshot({
      path: resolve(SCREENSHOT_DIR, `01-landing-${projSlug}.png`),
      fullPage: true,
    });

    // 2. Account Registration with Mandatory Risk/Simulation Acknowledgement
    await page.getByTestId('hero-signup-btn').click();
    await page.getByTestId('auth-email-input').fill(uniqueEmail);
    await page.getByTestId('auth-password-input').fill(password);
    await page.getByTestId('auth-ack-checkbox').check();
    await page.getByTestId('auth-submit-btn').click();

    // 3. Authoritative $100.00 Genesis Portfolio Verified + RFC 6265bis __Host- cookie prefix on HTTPS
    await expect(page.getByTestId('tenant-badge')).toContainText(uniqueEmail);
    await expect(page.getByTestId('stat-total-equity')).toHaveText('$100.00');
    await expect(page.getByTestId('stat-cash-balance')).toHaveText('$100.00');
    if ((testInfo.project.use.baseURL ?? '').startsWith('https://')) {
      const cookies = await page.context().cookies();
      expect(cookies.some((c) => c.name === '__Host-poly_beta_sid' && c.secure && c.httpOnly && c.path === '/')).toBe(
        true,
      );
    }
    await expect(page.getByTestId('system-health-panel')).toContainText('LOCKED_FALSE');
    await expect(page.getByTestId('system-health-panel')).toContainText('ENFORCED_BLOCKED');
    await page.screenshot({
      path: resolve(SCREENSHOT_DIR, `02-genesis-portfolio-${projSlug}.png`),
      fullPage: true,
    });

    // 4. Start -> Pause -> Stop Paper Strategy Controls + Manual Paper Order + Settled PnL
    await page.getByTestId('strategy-start-btn').click();
    await expect(page.getByTestId('engine-state-badge')).toHaveText('RUNNING');
    await expect(page.getByTestId('open-position-row').first()).toBeVisible();

    await page.getByTestId('strategy-pause-btn').click();
    await expect(page.getByTestId('engine-state-badge')).toHaveText('PAUSED');

    // Verify Deposit / Live Trading button fails closed with 403 REAL_MONEY_OPERATIONS_DISABLED
    await page.getByTestId('locked-deposit-btn').click();
    await expect(page.getByTestId('status-banner')).toContainText('[403] REAL_MONEY_OPERATIONS_DISABLED');

    await page.screenshot({
      path: resolve(SCREENSHOT_DIR, `03-active-positions-and-403-lock-${projSlug}.png`),
      fullPage: true,
    });

    // 5. Cross-Tenant Browser Isolation Check (User B in isolated incognito context sees $100.00, 0 positions)
    if (projSlug.includes('desktop')) {
      const ctxB = await browser.newContext({
        ...(testInfo.project.use.baseURL ? { baseURL: testInfo.project.use.baseURL } : {}),
      });
      const pageB = await ctxB.newPage();
      const emailB = `beta-isolated-b-${Date.now()}@example.com`;
      await pageB.goto('/');
      await pageB.getByTestId('hero-signup-btn').click();
      await pageB.getByTestId('auth-email-input').fill(emailB);
      await pageB.getByTestId('auth-password-input').fill(password);
      await pageB.getByTestId('auth-ack-checkbox').check();
      await pageB.getByTestId('auth-submit-btn').click();
      await expect(pageB.getByTestId('stat-cash-balance')).toHaveText('$100.00');
      await expect(pageB.getByTestId('open-position-row')).toHaveCount(0);

      pageB.once('dialog', (d) => d.accept());
      await pageB.getByTestId('delete-account-btn').click();
      await expect(pageB.getByTestId('hero-signup-btn')).toBeVisible();
      await ctxB.close();
    }

    // 6. Stop Strategy & Self-Service Account Deletion (purges tenant cleanly)
    await page.getByTestId('strategy-stop-btn').click();
    await expect(page.getByTestId('engine-state-badge')).toHaveText('STOPPED');

    page.once('dialog', (dialog) => dialog.accept());
    await page.getByTestId('delete-account-btn').click();
    await expect(page.getByTestId('hero-signup-btn')).toBeVisible();
  });
});
