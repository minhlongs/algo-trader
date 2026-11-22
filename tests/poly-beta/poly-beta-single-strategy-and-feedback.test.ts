import { describe, expect, it } from 'vitest';
import worker from '../../src/platform/poly-beta/poly-beta-worker';
import { executeSerializedPaperOrder } from '../../src/platform/poly-beta/poly-beta-execution';
import {
  APPROVED_PAPER_STRATEGIES,
  PILOT_APPROVED_STRATEGY_ID,
  isApprovedPaperStrategyId,
  type ApprovedPaperStrategyId,
  type PolyBetaEnv,
} from '../../src/platform/poly-beta/poly-beta-types';
import {
  createPolyBetaTestHarness,
  seedMarketSnapshots,
  testInviteTokenForEmail,
} from './poly-beta-test-harness';

const ORIGIN = 'https://poly-beta-dashboard.pages.dev';

async function signupTenant(env: PolyBetaEnv, email: string) {
  const res = await worker.fetch(
    new Request(`${ORIGIN}/api/beta/auth/signup`, {
      method: 'POST',
      headers: { Origin: ORIGIN, 'Content-Type': 'application/json' },
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
  const cookie = res.headers.get('Set-Cookie')!.split(';')[0]!;
  const body = (await res.json()) as { csrfToken: string; user: { tenantId: string } };
  return {
    cookie,
    csrfToken: body.csrfToken,
    tenantId: body.user.tenantId,
    headers: {
      Origin: ORIGIN,
      'Content-Type': 'application/json',
      Cookie: cookie,
      'X-CSRF-Token': body.csrfToken,
    },
  };
}

describe('Single strategy lock and fail-closed safety', () => {
  it('locks approved strategies strictly to toxicity-aware-mm-paper', () => {
    expect(APPROVED_PAPER_STRATEGIES).toHaveLength(1);
    expect(APPROVED_PAPER_STRATEGIES[0]!.id).toBe(PILOT_APPROVED_STRATEGY_ID);
    expect(isApprovedPaperStrategyId('toxicity-aware-mm-paper')).toBe(true);
    expect(isApprovedPaperStrategyId('neg-risk-bundle-paper')).toBe(false);
    expect(isApprovedPaperStrategyId('bayesian-fair-value-paper')).toBe(false);
    expect(isApprovedPaperStrategyId('arbitrary-strategy')).toBe(false);
    expect(isApprovedPaperStrategyId(null)).toBe(false);
  });

  it('rejects unsupported strategies on /api/beta/strategy/control, /api/beta/orders, and execution boundary', async () => {
    const { env, rawSqlite } = await createPolyBetaTestHarness();
    try {
      const alice = await signupTenant(env, 'alice@example.com');
      const market = seedMarketSnapshots()[0]!;

      for (const badId of ['neg-risk-bundle-paper', 'bayesian-fair-value-paper', 'custom-alpha']) {
        const ctrl = await worker.fetch(
          new Request(`${ORIGIN}/api/beta/strategy/control`, {
            method: 'POST',
            headers: alice.headers,
            body: JSON.stringify({ action: 'START', strategyId: badId, marketId: market.marketId }),
          }),
          env,
        );
        expect(ctrl.status).toBe(400);
        expect(await ctrl.json()).toMatchObject({ code: 'VALIDATION_ERROR' });

        const ord = await worker.fetch(
          new Request(`${ORIGIN}/api/beta/orders`, {
            method: 'POST',
            headers: alice.headers,
            body: JSON.stringify({
              idempotencyKey: `ord-bad-${badId}`,
              marketId: market.marketId,
              outcome: 'YES',
              side: 'BUY',
              sizeShares: 5,
              strategyId: badId,
            }),
          }),
          env,
        );
        expect(ord.status).toBe(400);
        expect(await ord.json()).toMatchObject({ code: 'VALIDATION_ERROR' });

        const execRes = await executeSerializedPaperOrder(env.POLY_BETA_DB, {
          tenantId: alice.tenantId,
          idempotencyKey: `exec-bad-${badId}`,
          strategyId: badId as ApprovedPaperStrategyId,
          market,
          outcome: 'YES',
          side: 'BUY',
          sizeShares: 5,
          nowMs: Date.now(),
        });
        expect(execRes).toMatchObject({ ok: false, code: 'UNSUPPORTED_STRATEGY' });
      }
    } finally {
      rawSqlite.close();
    }
  });

  it('fails closed on START, STEP, and DO alarm when persisted selected_strategy_id is unsupported', async () => {
    const { env, rawSqlite, engines } = await createPolyBetaTestHarness();
    try {
      const alice = await signupTenant(env, 'alice@example.com');

      // Simulate legacy persisted strategy in D1
      rawSqlite
        .prepare(`UPDATE beta_portfolios SET selected_strategy_id = 'neg-risk-bundle-paper' WHERE tenant_id = ?`)
        .run(alice.tenantId);

      const startRes = await worker.fetch(
        new Request(`${ORIGIN}/api/beta/strategy/control`, {
          method: 'POST',
          headers: alice.headers,
          body: JSON.stringify({ action: 'START' }),
        }),
        env,
      );
      expect(startRes.status).toBe(400);
      expect(await startRes.json()).toMatchObject({ code: 'UNSUPPORTED_STRATEGY' });

      const stepRes = await worker.fetch(
        new Request(`${ORIGIN}/api/beta/strategy/control`, {
          method: 'POST',
          headers: alice.headers,
          body: JSON.stringify({ action: 'STEP' }),
        }),
        env,
      );
      expect(stepRes.status).toBe(400);
      expect(await stepRes.json()).toMatchObject({ code: 'UNSUPPORTED_STRATEGY' });

      // Simulate DO alarm firing while persisted strategy is unsupported
      const doEntry = engines.get(alice.tenantId)!;
      await doEntry.storage.put('tenantId', alice.tenantId);
      await doEntry.storage.put('ticksRemaining', 5);
      rawSqlite
        .prepare(`UPDATE beta_portfolios SET engine_state = 'RUNNING' WHERE tenant_id = ?`)
        .run(alice.tenantId);
      await doEntry.instance.alarm();

      const pf = rawSqlite
        .prepare(`SELECT engine_state FROM beta_portfolios WHERE tenant_id = ?`)
        .get(alice.tenantId) as { engine_state: string };
      expect(pf.engine_state).toBe('PAUSED');
      const log = rawSqlite
        .prepare(`SELECT event_code FROM beta_execution_logs WHERE tenant_id = ? AND event_code = 'UNSUPPORTED_STRATEGY_BLOCKED'`)
        .get(alice.tenantId);
      expect(log).toBeTruthy();
      expect(doEntry.storage.getScheduledAlarm()).toBeNull();
    } finally {
      rawSqlite.close();
    }
  });

  it('enforces risk caps, stale market halt, sticky HALTED, LIVE_TRADING_ENABLED=true 503, and discloses marketDataProvenance', async () => {
    const { env, rawSqlite, kv } = await createPolyBetaTestHarness();
    try {
      const alice = await signupTenant(env, 'alice@example.com');
      const market = seedMarketSnapshots()[0]!;

      // Portfolio discloses marketDataProvenance
      const pfRes = await worker.fetch(
        new Request(`${ORIGIN}/api/beta/portfolio`, {
          method: 'GET',
          headers: { Origin: ORIGIN, Cookie: alice.cookie },
        }),
        env,
      );
      expect(pfRes.status).toBe(200);
      const pfJson = (await pfRes.json()) as {
        health: { marketDataProvenance: Record<string, unknown> };
      };
      expect(pfJson.health.marketDataProvenance).toEqual({
        gammaApi: 'https://gamma-api.polymarket.com',
        clobApi: 'https://clob.polymarket.com',
        stalenessLimitMs: 30_000,
        mode: 'READ_ONLY_PUBLIC_PAPER_FEED',
      });

      // $5 single-order cap (20 shares @ $0.46 = $9.20 > $5.00)
      const capRes = await worker.fetch(
        new Request(`${ORIGIN}/api/beta/orders`, {
          method: 'POST',
          headers: alice.headers,
          body: JSON.stringify({
            idempotencyKey: 'single-cap-1',
            marketId: market.marketId,
            outcome: 'YES',
            side: 'BUY',
            sizeShares: 20,
          }),
        }),
        env,
      );
      expect(capRes.status).toBe(422);
      expect(await capRes.json()).toMatchObject({ ok: false, code: 'SINGLE_ORDER_CAP' });

      // $20 exposure cap: 4 x 10 shares ($4.60 each = $18.40), then 5th order ($4.60 -> $23.00 > $20)
      for (let i = 1; i <= 4; i++) {
        const okOrd = await worker.fetch(
          new Request(`${ORIGIN}/api/beta/orders`, {
            method: 'POST',
            headers: alice.headers,
            body: JSON.stringify({
              idempotencyKey: `exp-ok-${i}`,
              marketId: market.marketId,
              outcome: 'YES',
              side: 'BUY',
              sizeShares: 10,
            }),
          }),
          env,
        );
        expect(okOrd.status).toBe(200);
      }
      const expCap = await worker.fetch(
        new Request(`${ORIGIN}/api/beta/orders`, {
          method: 'POST',
          headers: alice.headers,
          body: JSON.stringify({
            idempotencyKey: 'exp-cap-5',
            marketId: market.marketId,
            outcome: 'YES',
            side: 'BUY',
            sizeShares: 10,
          }),
        }),
        env,
      );
      expect(expCap.status).toBe(422);
      expect(await expCap.json()).toMatchObject({ ok: false, code: 'MAX_EXPOSURE_CAP' });

      // Stale market triggers HALTED, and STOP preserves sticky HALTED
      const staleMarkets = seedMarketSnapshots(Date.now() - 60_000);
      await kv.put('markets:public:v1', JSON.stringify(staleMarkets));
      const staleOrd = await worker.fetch(
        new Request(`${ORIGIN}/api/beta/orders`, {
          method: 'POST',
          headers: alice.headers,
          body: JSON.stringify({
            idempotencyKey: 'stale-ord-1',
            marketId: market.marketId,
            outcome: 'YES',
            side: 'BUY',
            sizeShares: 5,
          }),
        }),
        env,
      );
      expect(staleOrd.status).toBe(503);
      const stopWhileHalted = await worker.fetch(
        new Request(`${ORIGIN}/api/beta/strategy/control`, {
          method: 'POST',
          headers: alice.headers,
          body: JSON.stringify({ action: 'STOP' }),
        }),
        env,
      );
      expect(await stopWhileHalted.json()).toMatchObject({
        ok: true,
        engineState: 'HALTED',
        code: 'HALT_PRESERVED',
      });

      // LIVE_TRADING_ENABLED=true guard returns 503
      const liveGuard = await worker.fetch(
        new Request(`${ORIGIN}/api/health`, { method: 'GET' }),
        { ...env, LIVE_TRADING_ENABLED: 'true' },
      );
      expect(liveGuard.status).toBe(503);
      expect(await liveGuard.json()).toMatchObject({ code: 'LIVE_TRADING_FORBIDDEN_IN_BETA' });
    } finally {
      rawSqlite.close();
    }
  });
});

describe('In-app feedback API, isolation, rate limit, and account deletion purge', () => {
  it('creates and lists feedback scoped per tenant, rejects XSS/authority override, enforces rate limit, and purges on account delete', async () => {
    const { env, rawSqlite } = await createPolyBetaTestHarness();
    try {
      const alice = await signupTenant(env, 'alice@example.com');
      const bob = await signupTenant(env, 'bob@example.com');

      // 1. Valid submission -> 201
      const created = await worker.fetch(
        new Request(`${ORIGIN}/api/beta/feedback`, {
          method: 'POST',
          headers: alice.headers,
          body: JSON.stringify({
            category: 'trading_simulation',
            message: 'Paper fill latency and fee breakdown are clear.',
            screenId: 'dashboard/orders',
          }),
        }),
        env,
      );
      expect(created.status).toBe(201);
      const createdBody = (await created.json()) as {
        ok: true;
        feedback: { feedbackId: string; category: string; screenId: string; status: string; createdAtMs: number };
      };
      expect(createdBody.feedback).toMatchObject({
        category: 'trading_simulation',
        screenId: 'dashboard/orders',
        status: 'NEW',
      });

      // 2. Validation error (too short) -> 400 VALIDATION_ERROR
      const shortRes = await worker.fetch(
        new Request(`${ORIGIN}/api/beta/feedback`, {
          method: 'POST',
          headers: alice.headers,
          body: JSON.stringify({ category: 'bug', message: 'hi' }),
        }),
        env,
      );
      expect(shortRes.status).toBe(400);
      expect(await shortRes.json()).toMatchObject({ code: 'VALIDATION_ERROR' });

      // 3. XSS / script injection rejected -> 400 INVALID_FEEDBACK_CONTENT
      const xssRes = await worker.fetch(
        new Request(`${ORIGIN}/api/beta/feedback`, {
          method: 'POST',
          headers: alice.headers,
          body: JSON.stringify({
            category: 'bug',
            message: 'Broken chart <script>alert(1)</script>',
          }),
        }),
        env,
      );
      expect(xssRes.status).toBe(400);
      expect(await xssRes.json()).toMatchObject({ code: 'INVALID_FEEDBACK_CONTENT' });

      // 4. Caller tenantId override -> 403 CALLER_SCOPE_FORBIDDEN
      const overrideRes = await worker.fetch(
        new Request(`${ORIGIN}/api/beta/feedback`, {
          method: 'POST',
          headers: alice.headers,
          body: JSON.stringify({
            category: 'other',
            message: 'Attempting tenant override',
            tenantId: bob.tenantId,
          }),
        }),
        env,
      );
      expect(overrideRes.status).toBe(403);
      expect(await overrideRes.json()).toMatchObject({ code: 'CALLER_SCOPE_FORBIDDEN' });

      // 5. Cross-tenant isolation: Bob cannot see Alice's feedback
      const bobList = await worker.fetch(
        new Request(`${ORIGIN}/api/beta/feedback`, {
          method: 'GET',
          headers: { Origin: ORIGIN, Cookie: bob.cookie },
        }),
        env,
      );
      expect(bobList.status).toBe(200);
      expect(await bobList.json()).toMatchObject({ ok: true, feedback: [] });

      const aliceList = await worker.fetch(
        new Request(`${ORIGIN}/api/beta/feedback`, {
          method: 'GET',
          headers: { Origin: ORIGIN, Cookie: alice.cookie },
        }),
        env,
      );
      expect(aliceList.status).toBe(200);
      const aliceItems = (await aliceList.json()) as { feedback: Array<{ feedbackId: string }> };
      expect(aliceItems.feedback).toHaveLength(1);
      expect(aliceItems.feedback[0]!.feedbackId).toBe(createdBody.feedback.feedbackId);

      // 6. Rate limit: 10 submissions per hour per tenant -> 11th returns 429
      for (let i = 0; i < 6; i++) {
        await worker.fetch(
          new Request(`${ORIGIN}/api/beta/feedback`, {
            method: 'POST',
            headers: alice.headers,
            body: JSON.stringify({ category: 'other', message: `Rate limit probe number ${i}` }),
          }),
          env,
        );
      }
      const rlRes = await worker.fetch(
        new Request(`${ORIGIN}/api/beta/feedback`, {
          method: 'POST',
          headers: alice.headers,
          body: JSON.stringify({ category: 'other', message: 'Exceeds hourly feedback cap' }),
        }),
        env,
      );
      expect(rlRes.status).toBe(429);
      expect(await rlRes.json()).toMatchObject({ code: 'RATE_LIMITED' });

      // 7. Account deletion purges all beta_feedback rows for Alice
      const delRes = await worker.fetch(
        new Request(`${ORIGIN}/api/beta/account`, {
          method: 'DELETE',
          headers: alice.headers,
        }),
        env,
      );
      expect(delRes.status).toBe(200);
      const remaining = rawSqlite
        .prepare(`SELECT COUNT(*) AS cnt FROM beta_feedback WHERE tenant_id = ?`)
        .get(alice.tenantId) as { cnt: number };
      expect(remaining.cnt).toBe(0);
    } finally {
      rawSqlite.close();
    }
  });

  it('halts authenticated API routes with 503 MAINTENANCE_MODE while keeping health and logout available', async () => {
    const { env, rawSqlite } = await createPolyBetaTestHarness();
    try {
      const alice = await signupTenant(env, 'alice@example.com');
      const maintEnv = { ...env, MAINTENANCE_MODE: 'true' };

      const blockedPortfolio = await worker.fetch(
        new Request(`${ORIGIN}/api/beta/portfolio`, { method: 'GET', headers: { Origin: ORIGIN, Cookie: alice.cookie } }),
        maintEnv,
      );
      expect(blockedPortfolio.status).toBe(503);
      expect(await blockedPortfolio.json()).toMatchObject({ code: 'MAINTENANCE_MODE' });

      const healthRes = await worker.fetch(new Request(`${ORIGIN}/api/health`, { method: 'GET' }), maintEnv);
      expect(healthRes.status).toBe(200);

      const logoutRes = await worker.fetch(
        new Request(`${ORIGIN}/api/beta/auth/logout`, { method: 'POST', headers: alice.headers }),
        maintEnv,
      );
      expect(logoutRes.status).toBe(200);
    } finally {
      rawSqlite.close();
    }
  });
});
