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
    headers: { Origin: ORIGIN, 'Content-Type': 'application/json', Cookie: cookie, 'X-CSRF-Token': body.csrfToken },
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

      const doEntry = engines.get(alice.tenantId)!;
      await doEntry.storage.put('tenantId', alice.tenantId);
      await doEntry.storage.put('ticksRemaining', 5);
      rawSqlite.prepare(`UPDATE beta_portfolios SET engine_state = 'RUNNING' WHERE tenant_id = ?`).run(alice.tenantId);
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
});
