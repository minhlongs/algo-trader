/**
 * LOCAL Paper Beta First-User E2E Suite (18-Flow Verification)
 *
 * Runs 100% locally against the compiled `VITE_APP_MODE=poly-beta` dashboard +
 * real in-process `poly-beta-worker.ts` + real `node:sqlite` D1 + `TenantPaperEngine` DO.
 *
 * Note: LOCAL_E2E_PASS is strictly separate from DEPLOYED_E2E = NOT_EXECUTED.
 */

import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  startLocalPolyBetaServer,
  type LocalPolyBetaServer,
} from './poly-beta-local-harness';
import { testInviteTokenForEmail } from '../poly-beta/poly-beta-test-harness';

const LOCAL_DIST_DIR = process.env.POLY_BETA_LOCAL_DIST_DIR || '/tmp/poly-g9-build/dashboard';
const SCREENSHOT_DIR = '/tmp/poly-g9-e2e-screenshots';

async function fetchSessionInfo(
  page: Page,
  baseUrl: string,
): Promise<{ csrfToken: string; tenantId: string; email: string }> {
  const res = await page.request.get(`${baseUrl}/api/beta/auth/me`, {
    headers: { Origin: baseUrl },
  });
  expect(res.status()).toBe(200);
  const body = (await res.json()) as {
    csrfToken?: string;
    user?: { tenantId?: string; email?: string };
  };
  const csrfToken = body.csrfToken ?? '';
  const tenantId = body.user?.tenantId ?? '';
  const email = body.user?.email ?? '';
  expect(csrfToken.length).toBeGreaterThan(10);
  expect(tenantId.length).toBeGreaterThan(0);
  return { csrfToken, tenantId, email };
}

test.describe('LOCAL Paper Beta First-User E2E', () => {
  let localServer: LocalPolyBetaServer | null = null;
  let primaryEmail = '';
  let validInviteToken = '';
  const unlistedEmail = 'unlisted@example.com';
  const wrongInviteToken = 'f'.repeat(64);
  const password = 'Strong#BetaPassword2026!';

  test.beforeEach(async ({}, testInfo) => {
    mkdirSync(SCREENSHOT_DIR, { recursive: true });
    const projSlug = testInfo.project.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    primaryEmail = `pilot-${projSlug}-${Date.now()}@example.com`;
    validInviteToken = testInviteTokenForEmail(primaryEmail, 'pilot-local');

    if (!process.env.POLY_BETA_URL) {
      localServer = await startLocalPolyBetaServer({
        distDir: LOCAL_DIST_DIR,
        allowlistedEmails: [primaryEmail],
        invites: [{ rawToken: validInviteToken, email: primaryEmail }],
      });
    }
  });

  test.afterEach(async () => {
    if (localServer) {
      await localServer.close();
      localServer = null;
    }
  });

  test('verifies all 18 local paper-beta first-user flows end-to-end', async ({
    page,
  }, testInfo) => {
    const baseUrl = process.env.POLY_BETA_URL || localServer?.baseUrl;
    if (!baseUrl) {
      throw new Error('Missing baseUrl for LOCAL Paper Beta First-User E2E');
    }
    const projSlug = testInfo.project.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const isHttps = baseUrl.startsWith('https://');

    // 1. Paper-only landing page
    await page.goto(baseUrl);
    await expect(page.getByTestId('paper-mode-banner')).toContainText('LIVE_TRADING_ENABLED=false');

    // 2a. Truthful disclosures on landing page
    await expect(page.getByTestId('simulation-risk-disclosure')).toBeVisible();
    await page.screenshot({
      path: resolve(SCREENSHOT_DIR, `01-landing-${projSlug}.png`),
      fullPage: true,
    });

    // 3. Private signup gate: unlisted email rejected with 403 SIGNUP_NOT_ALLOWLISTED
    await page.getByTestId('hero-signup-btn').click();
    await page.getByTestId('auth-email-input').fill(unlistedEmail);
    await page.getByTestId('auth-invite-input').fill(validInviteToken);
    await page.getByTestId('auth-password-input').fill(password);
    await page.getByTestId('auth-ack-checkbox').check();
    const unlistedRespPromise = page.waitForResponse(
      (r) => r.url().includes('/api/beta/auth/signup') && r.request().method() === 'POST',
    );
    await page.getByTestId('auth-submit-btn').click();
    const unlistedResp = await unlistedRespPromise;
    expect(unlistedResp.status()).toBe(403);
    expect(await unlistedResp.text()).toContain('SIGNUP_ALLOWLIST_REQUIRED');
    await expect(page.getByTestId('auth-error-msg')).toBeVisible();

    // 4. Missing/invalid invite token: allowlisted email + wrong 64-char token rejected with 403 INVITE_TOKEN_INVALID
    await page.getByTestId('auth-email-input').fill(primaryEmail);
    await page.getByTestId('auth-invite-input').fill(wrongInviteToken);
    const invalidTokenRespPromise = page.waitForResponse(
      (r) => r.url().includes('/api/beta/auth/signup') && r.request().method() === 'POST',
    );
    await page.getByTestId('auth-submit-btn').click();
    const invalidTokenResp = await invalidTokenRespPromise;
    expect(invalidTokenResp.status()).toBe(403);
    expect(await invalidTokenResp.text()).toContain('INVITE_TOKEN_INVALID');
    await expect(page.getByTestId('auth-error-msg')).toBeVisible();

    // 5. Valid invite flow: allowlisted email + valid 64-char invite token + risk ack -> authenticated dashboard
    await page.getByTestId('auth-email-input').fill(primaryEmail);
    await page.getByTestId('auth-invite-input').fill(validInviteToken);
    await page.getByTestId('auth-submit-btn').click();

    await expect(page.getByTestId('tenant-badge')).toContainText(primaryEmail);
    // 2b. Truthful disclosures inside dashboard health panel
    await expect(page.getByTestId('market-data-provenance')).toBeVisible();

    // Verify HttpOnly session cookie (poly_beta_sid on HTTP localhost, __Host-poly_beta_sid on HTTPS)
    const cookies = await page.context().cookies();
    const expectedCookieName = isHttps ? '__Host-poly_beta_sid' : 'poly_beta_sid';
    const sessionCookie = cookies.find((c) => c.name === expectedCookieName);
    expect(sessionCookie).toBeDefined();
    expect(sessionCookie?.httpOnly).toBe(true);
    if (isHttps) {
      expect(sessionCookie?.secure).toBe(true);
    }

    // 6. Atomic token redemption: reusing the exact same invite token fails with 403 or 409
    const replayRes = await page.request.post(`${baseUrl}/api/beta/auth/signup`, {
      headers: { 'Content-Type': 'application/json', Origin: baseUrl },
      data: {
        email: primaryEmail,
        password,
        inviteToken: validInviteToken,
        acknowledgeSimulationAndRisk: true,
      },
    });
    expect([403, 409]).toContain(replayRes.status());

    // 7. Login flow: logout then log back in via nav-login-btn
    await page.getByTestId('logout-btn').click();
    await expect(page.getByTestId('nav-login-btn')).toBeVisible();
    await page.getByTestId('nav-login-btn').click();
    await page.getByTestId('auth-email-input').fill(primaryEmail);
    await page.getByTestId('auth-password-input').fill(password);
    await page.getByTestId('auth-submit-btn').click();
    await expect(page.getByTestId('tenant-badge')).toContainText(primaryEmail);

    const session = await fetchSessionInfo(page, baseUrl);
    const authedHeaders = {
      'Content-Type': 'application/json',
      Origin: baseUrl,
      'X-CSRF-Token': session.csrfToken,
    };

    // 8. One supported strategy: strategy-select has exactly 1 option; unsupported strategy returns 400
    const strategyOptions = page.getByTestId('strategy-select').locator('option');
    await expect(strategyOptions).toHaveCount(1);
    await expect(strategyOptions.first()).toHaveAttribute('value', 'toxicity-aware-mm-paper');

    const unsupportedStratRes = await page.request.post(`${baseUrl}/api/beta/strategy/control`, {
      headers: authedHeaders,
      data: {
        action: 'START',
        strategyId: 'neg-risk-bundle-paper',
        marketId: 'mkt-fed-rate-2026',
      },
    });
    expect(unsupportedStratRes.status()).toBe(400);

    // 9. Virtual $100 equity + #1 GENESIS_GRANT
    await expect(page.getByTestId('stat-total-equity')).toHaveText('$100.00');
    await expect(page.getByTestId('stat-cash-balance')).toHaveText('$100.00');
    await expect(page.getByTestId('ledger-entry-row').first()).toContainText('#1 GENESIS_GRANT');

    // 10. Risk-budget behavior: single order exceeding $5.00 cap rejected with 422 MAX_SINGLE_ORDER_EXCEEDED
    const oversizedOrderRes = await page.request.post(`${baseUrl}/api/beta/orders`, {
      headers: authedHeaders,
      data: {
        idempotencyKey: `oversized-${Date.now()}`,
        marketId: 'mkt-fed-rate-2026',
        outcome: 'YES',
        side: 'BUY',
        sizeShares: 20,
      },
    });
    expect(oversizedOrderRes.status()).toBe(422);
    expect(await oversizedOrderRes.text()).toContain('SINGLE_ORDER_CAP');

    // 11. Simulated paper trade: start -> open position + cash changed -> pause -> stop
    await page.getByTestId('strategy-start-btn').click();
    await expect(page.getByTestId('open-position-row').first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('stat-cash-balance')).not.toHaveText('$100.00');

    await page.getByTestId('strategy-pause-btn').click();
    await expect(page.getByTestId('engine-state-badge')).toHaveText('PAUSED');

    await page.getByTestId('strategy-stop-btn').click();
    await expect(page.getByTestId('engine-state-badge')).toHaveText('STOPPED');

    // 12. HALTED state: place 2 buys of 10 YES shares on mkt-fed-rate-2026 ($9.20 total) and settle NO -> drawdown >5% -> HALTED
    for (let i = 0; i < 2; i += 1) {
      const buyRes = await page.request.post(`${baseUrl}/api/beta/orders`, {
        headers: authedHeaders,
        data: {
          idempotencyKey: `halt-buy-${i}-${Date.now()}`,
          marketId: 'mkt-fed-rate-2026',
          outcome: 'YES',
          side: 'BUY',
          sizeShares: 10,
        },
      });
      expect(buyRes.status()).toBe(200);
    }

    const settleRes = await page.request.post(`${baseUrl}/api/beta/positions/settle`, {
      headers: authedHeaders,
      data: {
        marketId: 'mkt-fed-rate-2026',
        winningOutcome: 'NO',
      },
    });
    expect(settleRes.status()).toBe(200);

    await page.reload();
    await expect(page.getByTestId('engine-state-badge')).toHaveText('HALTED');
    await expect(page.getByTestId('strategy-start-btn')).toBeDisabled();

    // 13. Feedback submission
    const feedbackText = 'Clear $100 paper balance and risk cap behavior';
    await page.getByTestId('feedback-category-select').selectOption('trading_simulation');
    await page.getByTestId('feedback-message-input').fill(feedbackText);
    await page.getByTestId('feedback-submit-btn').click();
    await expect(page.getByTestId('feedback-status')).toBeVisible();
    await expect(page.getByTestId('feedback-history-item')).toHaveCount(1);

    // 14. Feedback persistence across reload
    await page.reload();
    await expect(page.getByTestId('feedback-history-item')).toHaveCount(1);
    await expect(page.getByTestId('feedback-history-item').first()).toBeVisible();
    if (localServer) {
      const savedRow = localServer.rawSqlite
        .prepare('SELECT message FROM beta_feedback WHERE tenant_id = ?')
        .get(session.tenantId) as { message?: string } | undefined;
      expect(savedRow?.message).toBe(feedbackText);
    }

    // 17. No real-money controls (before account deletion)
    await page.getByTestId('locked-deposit-btn').click();
    await expect(page.getByTestId('status-banner')).toContainText('403');
    await expect(page.getByTestId('status-banner')).toContainText('REAL_MONEY_OPERATIONS_DISABLED');

    // 18. No unauthorized live endpoints
    const withdrawRes = await page.request.post(`${baseUrl}/api/beta/withdraw`, {
      headers: authedHeaders,
      data: { amountUsd: 10 },
    });
    expect(withdrawRes.status()).toBe(403);
    expect(await withdrawRes.text()).toContain('REAL_MONEY_OPERATIONS_DISABLED');

    const liveOrderRes = await page.request.post(`${baseUrl}/api/beta/live-order`, {
      headers: authedHeaders,
      data: { marketId: 'mkt-fed-rate-2026' },
    });
    expect(liveOrderRes.status()).toBe(403);
    expect(await liveOrderRes.text()).toContain('REAL_MONEY_OPERATIONS_DISABLED');

    const unknownRes = await page.request.post(`${baseUrl}/api/beta/nonexistent-endpoint`, {
      headers: authedHeaders,
      data: {},
    });
    expect(unknownRes.status()).toBe(404);

    // 15. Privacy notice / account danger zone visible before deletion
    await expect(page.getByTestId('account-danger-zone')).toBeVisible();
    await page.screenshot({
      path: resolve(SCREENSHOT_DIR, `02-halted-feedback-and-danger-zone-${projSlug}.png`),
      fullPage: true,
    });

    // 16. Account data deletion + SQLite verification
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByTestId('delete-account-btn').click();
    await expect(page.getByTestId('hero-signup-btn')).toBeVisible();

    if (localServer) {
      const userCountRow = localServer.rawSqlite
        .prepare('SELECT COUNT(*) AS cnt FROM beta_users WHERE tenant_id = ?')
        .get(session.tenantId) as { cnt: number };
      const feedbackCountRow = localServer.rawSqlite
        .prepare('SELECT COUNT(*) AS cnt FROM beta_feedback WHERE tenant_id = ?')
        .get(session.tenantId) as { cnt: number };
      const redemptionCountRow = localServer.rawSqlite
        .prepare('SELECT COUNT(*) AS cnt FROM beta_invite_redemptions')
        .get() as { cnt: number };

      expect(userCountRow.cnt).toBe(0);
      expect(feedbackCountRow.cnt).toBe(0);
      expect(redemptionCountRow.cnt).toBeGreaterThanOrEqual(1);
    }
  });
});
