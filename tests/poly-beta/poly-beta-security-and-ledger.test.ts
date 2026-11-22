/**
 * Phase 1 + Phase 3 — Automated Adversarial Multi-Tenant Security (User A vs User B),
 * Authoritative $100 Ledger Accounting, DO Alarm Lifecycle, and Real-Money Fail-Closed Tests.
 */

import { describe, expect, it } from 'vitest';
import worker from '../../src/platform/poly-beta/poly-beta-worker';
import { fetchSupportedBetaMarkets } from '../../src/platform/poly-beta/poly-beta-markets';
import { createPolyBetaTestHarness, seedMarketSnapshots, testInviteTokenForEmail } from './poly-beta-test-harness';

const ORIGIN = 'https://poly-beta-dashboard.pages.dev';

function parseCookiePair(setCookie: string | null): string {
  expect(setCookie).toBeTruthy();
  return setCookie!.split(';')[0]!;
}

async function signupUser(env: Awaited<ReturnType<typeof createPolyBetaTestHarness>>['env'], email: string) {
  const res = await worker.fetch(
    new Request('https://poly-beta-api.workers.dev/api/beta/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
      body: JSON.stringify({
        email,
        password: 'Strong#BetaPassword2026!',
        inviteToken: testInviteTokenForEmail(email),
        acknowledgeSimulationAndRisk: true,
      }),
    }),
    env,
  );
  expect(res.status).toBe(201);
  const setCookie = res.headers.get('Set-Cookie');
  expect(setCookie).toContain('HttpOnly');
  expect(setCookie).toContain('Secure');
  expect(setCookie).toContain('SameSite=None');
  const data = (await res.json()) as {
    user: { email: string; tenantId: string };
    csrfToken: string;
    initialCapitalUsd: number;
  };
  return { cookie: parseCookiePair(setCookie), csrf: data.csrfToken, tenantId: data.user.tenantId };
}

describe('POLY-G5 Public Beta Worker — Multi-Tenant Security & Authoritative $100 Ledger', () => {
  it('enforces User A vs User B isolation across portfolio, orders, cancellation, CSRF, Origin, and caller-supplied tenantId overrides', async () => {
    const { env } = await createPolyBetaTestHarness();
    const userA = await signupUser(env, 'alice@example.com');
    const userB = await signupUser(env, 'bob@example.com');
    expect(userA.tenantId).not.toBe(userB.tenantId);

    // User A places a valid $4.60 paper BUY order (10 shares @ $0.46)
    const orderARes = await worker.fetch(
      new Request('https://poly-beta-api.workers.dev/api/beta/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: ORIGIN,
          Cookie: userA.cookie,
          'X-CSRF-Token': userA.csrf,
        },
        body: JSON.stringify({
          idempotencyKey: 'alice-order-001',
          marketId: 'mkt-fed-rate-2026',
          outcome: 'YES',
          side: 'BUY',
          sizeShares: 10,
        }),
      }),
      env,
    );
    expect(orderARes.status).toBe(200);
    const orderAData = (await orderARes.json()) as { ok: boolean; orderId: string };
    expect(orderAData.ok).toBe(true);

    // User A also places a resting post-only limit order (10 shares @ $0.30 = $3.00)
    const restingARes = await worker.fetch(
      new Request('https://poly-beta-api.workers.dev/api/beta/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: ORIGIN,
          Cookie: userA.cookie,
          'X-CSRF-Token': userA.csrf,
        },
        body: JSON.stringify({
          idempotencyKey: 'alice-resting-001',
          marketId: 'mkt-fed-rate-2026',
          outcome: 'YES',
          side: 'BUY',
          sizeShares: 10,
          limitPrice: 0.3,
        }),
      }),
      env,
    );
    const restingAData = (await restingARes.json()) as { orderId: string };
    expect(restingARes.status).toBe(200);

    // ADVERSARIAL 1: User B queries portfolio -> sees ONLY User B's $100 untouched portfolio, 0 orders/fills from User A
    const pfBRes = await worker.fetch(
      new Request('https://poly-beta-api.workers.dev/api/beta/portfolio', {
        headers: { Origin: ORIGIN, Cookie: userB.cookie },
      }),
      env,
    );
    const pfB = (await pfBRes.json()) as {
      tenantId: string;
      summary: { cashBalanceUsd: number; openExposureUsd: number };
      orders: unknown[];
      fills: unknown[];
      openPositions: unknown[];
    };
    expect(pfB.tenantId).toBe(userB.tenantId);
    expect(pfB.summary.cashBalanceUsd).toBe(100);
    expect(pfB.summary.openExposureUsd).toBe(0);
    expect(pfB.orders).toHaveLength(0);
    expect(pfB.fills).toHaveLength(0);
    expect(pfB.openPositions).toHaveLength(0);

    // ADVERSARIAL 2: User B tries to spoof `?tenantId=<Alice>` on GET /api/beta/portfolio -> 403
    const spoofQueryRes = await worker.fetch(
      new Request(`https://poly-beta-api.workers.dev/api/beta/portfolio?tenantId=${userA.tenantId}`, {
        headers: { Origin: ORIGIN, Cookie: userB.cookie },
      }),
      env,
    );
    expect(spoofQueryRes.status).toBe(403);

    // ADVERSARIAL 3: User B tries to inject `tenantId` or `walletAddress` in POST body -> 403
    const spoofBodyRes = await worker.fetch(
      new Request('https://poly-beta-api.workers.dev/api/beta/strategy/control', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: ORIGIN,
          Cookie: userB.cookie,
          'X-CSRF-Token': userB.csrf,
        },
        body: JSON.stringify({ action: 'START', tenantId: userA.tenantId }),
      }),
      env,
    );
    expect(spoofBodyRes.status).toBe(403);

    // ADVERSARIAL 4: User B tries to cancel User A's resting order ID -> 404 (User A's order remains PENDING)
    const crossCancelRes = await worker.fetch(
      new Request(`https://poly-beta-api.workers.dev/api/beta/orders/${restingAData.orderId}/cancel`, {
        method: 'POST',
        headers: { Origin: ORIGIN, Cookie: userB.cookie, 'X-CSRF-Token': userB.csrf },
      }),
      env,
    );
    expect(crossCancelRes.status).toBe(404);

    // ADVERSARIAL 5: Missing CSRF token or User B's CSRF token with User A's cookie -> 403
    const csrfMismatchRes = await worker.fetch(
      new Request('https://poly-beta-api.workers.dev/api/beta/strategy/control', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: ORIGIN,
          Cookie: userA.cookie,
          'X-CSRF-Token': userB.csrf,
        },
        body: JSON.stringify({ action: 'START' }),
      }),
      env,
    );
    expect(csrfMismatchRes.status).toBe(403);

    // ADVERSARIAL 6: Evil cross-site Origin with valid cookie -> 403
    const evilOriginRes = await worker.fetch(
      new Request('https://poly-beta-api.workers.dev/api/beta/strategy/control', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'https://evil-attacker.example',
          Cookie: userA.cookie,
          'X-CSRF-Token': userA.csrf,
        },
        body: JSON.stringify({ action: 'START' }),
      }),
      env,
    );
    expect(evilOriginRes.status).toBe(403);

    // Verify User A's resting order is still intact
    const pfARes = await worker.fetch(
      new Request('https://poly-beta-api.workers.dev/api/beta/portfolio', {
        headers: { Origin: ORIGIN, Cookie: userA.cookie },
      }),
      env,
    );
    const pfA = (await pfARes.json()) as { pendingOrders: Array<{ order_id: string }> };
    expect(pfA.pendingOrders.map((o) => o.order_id)).toContain(restingAData.orderId);
  });

  it('separates Realized / Unrealized / Settled PnL accurately, manages DO alarm on START/PAUSE/STOP, and purges account on self-service DELETE', async () => {
    const { env, engines } = await createPolyBetaTestHarness();
    const user = await signupUser(env, 'trader1@example.com');

    // Start paper engine -> sets active DO alarm & executes initial step
    const startRes = await worker.fetch(
      new Request('https://poly-beta-api.workers.dev/api/beta/strategy/control', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: ORIGIN,
          Cookie: user.cookie,
          'X-CSRF-Token': user.csrf,
        },
        body: JSON.stringify({
          action: 'START',
          strategyId: 'toxicity-aware-mm-paper',
          marketId: 'mkt-fed-rate-2026',
        }),
      }),
      env,
    );
    expect(startRes.status).toBe(200);
    expect(engines.get(user.tenantId)?.storage.getScheduledAlarm()).not.toBeNull();

    // Trigger one DO alarm tick, then PAUSE (clears alarm)
    await engines.get(user.tenantId)!.instance.alarm();
    const pauseRes = await worker.fetch(
      new Request('https://poly-beta-api.workers.dev/api/beta/strategy/control', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: ORIGIN,
          Cookie: user.cookie,
          'X-CSRF-Token': user.csrf,
        },
        body: JSON.stringify({ action: 'PAUSE' }),
      }),
      env,
    );
    expect(pauseRes.status).toBe(200);
    expect(engines.get(user.tenantId)?.storage.getScheduledAlarm()).toBeNull();

    // Sell 5 shares to realize trading PnL, then settle remaining shares at binary resolution ($1)
    const sellRes = await worker.fetch(
      new Request('https://poly-beta-api.workers.dev/api/beta/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: ORIGIN,
          Cookie: user.cookie,
          'X-CSRF-Token': user.csrf,
        },
        body: JSON.stringify({
          idempotencyKey: 'manual-sell-1',
          marketId: 'mkt-fed-rate-2026',
          outcome: 'YES',
          side: 'SELL',
          sizeShares: 5,
        }),
      }),
      env,
    );
    expect(sellRes.status).toBe(200);

    // Replay same idempotencyKey -> idempotent, no duplicate debit/credit
    const replayRes = await worker.fetch(
      new Request('https://poly-beta-api.workers.dev/api/beta/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: ORIGIN,
          Cookie: user.cookie,
          'X-CSRF-Token': user.csrf,
        },
        body: JSON.stringify({
          idempotencyKey: 'manual-sell-1',
          marketId: 'mkt-fed-rate-2026',
          outcome: 'YES',
          side: 'SELL',
          sizeShares: 5,
        }),
      }),
      env,
    );
    const replayBody = (await replayRes.json()) as { idempotentReplay: boolean };
    expect(replayBody.idempotentReplay).toBe(true);

    const settleRes = await worker.fetch(
      new Request('https://poly-beta-api.workers.dev/api/beta/positions/settle', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: ORIGIN,
          Cookie: user.cookie,
          'X-CSRF-Token': user.csrf,
        },
        body: JSON.stringify({ marketId: 'mkt-fed-rate-2026', winningOutcome: 'YES' }),
      }),
      env,
    );
    expect(settleRes.status).toBe(200);

    const pfRes = await worker.fetch(
      new Request('https://poly-beta-api.workers.dev/api/beta/portfolio', {
        headers: { Origin: ORIGIN, Cookie: user.cookie },
      }),
      env,
    );
    const pf = (await pfRes.json()) as {
      summary: {
        cashBalanceUsd: number;
        realizedTradingPnlUsd: number;
        unrealizedMtmPnlUsd: number;
        settledRedemptionPnlUsd: number;
        feesPaidUsd: number;
      };
    };
    expect(pf.summary.settledRedemptionPnlUsd).toBeGreaterThan(0);
    expect(pf.summary.realizedTradingPnlUsd).toBeLessThan(0); // spread + fee on immediate sell at bid
    expect(pf.summary.unrealizedMtmPnlUsd).toBe(0);
    expect(pf.summary.feesPaidUsd).toBeGreaterThan(0);

    // Self-service account deletion wipes session & all tenant data
    const delRes = await worker.fetch(
      new Request('https://poly-beta-api.workers.dev/api/beta/account', {
        method: 'DELETE',
        headers: { Origin: ORIGIN, Cookie: user.cookie, 'X-CSRF-Token': user.csrf },
      }),
      env,
    );
    expect(delRes.status).toBe(200);

    const afterDelRes = await worker.fetch(
      new Request('https://poly-beta-api.workers.dev/api/beta/portfolio', {
        headers: { Origin: ORIGIN, Cookie: user.cookie },
      }),
      env,
    );
    expect(afterDelRes.status).toBe(401);
  });

  it('fails closed on real-money/deposit/live endpoints, LIVE_TRADING_ENABLED misconfig, 5m crypto markets, stale market feeds, and login rate limits', async () => {
    const { env, kv } = await createPolyBetaTestHarness();

    // 1. Deposit, withdraw, approve, live, and billing paths all fail closed with 403
    for (const blockedPath of [
      '/api/beta/deposit',
      '/api/beta/withdraw',
      '/api/beta/live/order',
      '/api/beta/wallet/connect',
      '/api/beta/seed',
      '/api/webhooks/nowpayments',
      '/api/v1/subscriptions/upgrade',
    ]) {
      const r = await worker.fetch(new Request(`https://poly-beta-api.workers.dev${blockedPath}`, { method: 'POST' }), env);
      expect(r.status).toBe(403);
    }

    // 2. Misconfigured LIVE_TRADING_ENABLED="true" halts entire Worker with 503
    const misconfigRes = await worker.fetch(
      new Request('https://poly-beta-api.workers.dev/api/health'),
      { ...env, LIVE_TRADING_ENABLED: 'true' },
    );
    expect(misconfigRes.status).toBe(503);

    // 3. Upstream Gamma market parser filters out 5-minute crypto markets automatically
    await kv.delete('markets:public:v1');
    const filtered = await fetchSupportedBetaMarkets(env, {
      nowMs: 1_760_000_000_000,
      fetchImpl: async () =>
        new Response(
          JSON.stringify([
            {
              id: '5m-btc',
              question: 'Bitcoin Up or Down in the next 5 minutes?',
              slug: 'btc-updown-5m',
              clobTokenIds: '["1","2"]',
              outcomePrices: '["0.5","0.5"]',
              active: true,
              closed: false,
            },
            {
              id: 'macro-valid',
              question: 'Will US GDP exceed 2.5% in 2026?',
              slug: 'us-gdp-2026',
              clobTokenIds: '["10","20"]',
              outcomePrices: '["0.55","0.45"]',
              bestBid: '0.54',
              bestAsk: '0.56',
              updatedAt: new Date(1_760_000_000_000 - 5_000).toISOString(),
              active: true,
              closed: false,
            },
          ]),
          { status: 200 },
        ),
    });
    expect(filtered.markets.map((m) => m.marketId)).toEqual(['macro-valid']);

    // 4. Stale market snapshot (>30s) transitions tenant engine to HALTED fail-closed
    const staleSnap = seedMarketSnapshots(Date.now() - 120_000);
    staleSnap[0]!.sourceTimestampMs = Date.now() - 120_000;
    await kv.put('markets:public:v1', JSON.stringify(staleSnap));
    const user = await signupUser(env, 'stale-check@example.com');
    const staleOrder = await worker.fetch(
      new Request('https://poly-beta-api.workers.dev/api/beta/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: ORIGIN,
          Cookie: user.cookie,
          'X-CSRF-Token': user.csrf,
        },
        body: JSON.stringify({
          idempotencyKey: 'stale-ord-1',
          marketId: 'mkt-fed-rate-2026',
          outcome: 'YES',
          side: 'BUY',
          sizeShares: 5,
        }),
      }),
      env,
    );
    expect(staleOrder.status).toBe(503);

    // 5. Brute-force login rate limiter triggers 429 after 12 attempts from same IP
    let lastStatus = 0;
    for (let i = 0; i < 13; i++) {
      const r = await worker.fetch(
        new Request('https://poly-beta-api.workers.dev/api/beta/auth/login', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Origin: ORIGIN,
            'CF-Connecting-IP': '203.0.113.77',
          },
          body: JSON.stringify({ email: 'nobody@example.com', password: 'wrong' }),
        }),
        env,
      );
      lastStatus = r.status;
    }
    expect(lastStatus).toBe(429);
  });
});
