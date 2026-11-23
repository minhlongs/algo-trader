import { describe, expect, it } from 'vitest';
import worker from '../../src/platform/poly-beta/poly-beta-worker';
import { createPolyBetaTestHarness, seedMarketSnapshots, testInviteTokenForEmail } from './poly-beta-test-harness';

const ORIGIN = 'https://poly-beta-dashboard.pages.dev';

describe('Beta single approved strategy execution harness', () => {
  it('toxicity-aware-mm-paper places an immediate taker order at best ask', async () => {
    const { env, rawSqlite, engines } = await createPolyBetaTestHarness();
    try {
      const strategyId = 'toxicity-aware-mm-paper';
      const signup = await worker.fetch(new Request(`${ORIGIN}/api/beta/auth/signup`, {
        method: 'POST', headers: { Origin: ORIGIN, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: `${strategyId}@example.com`,
          password: 'Strong#BetaPassword2026!',
          inviteToken: testInviteTokenForEmail(`${strategyId}@example.com`),
          acknowledgeSimulationAndRisk: true }),
      }), env);
      expect(signup.status).toBe(201);
      const cookie = signup.headers.get('Set-Cookie')!.split(';')[0]!;
      const { csrfToken, user } = await signup.json() as {
        csrfToken: string; user: { tenantId: string };
      };
      const started = await worker.fetch(new Request(`${ORIGIN}/api/beta/strategy/control`, {
        method: 'POST', headers: { Origin: ORIGIN, 'Content-Type': 'application/json',
          Cookie: cookie, 'X-CSRF-Token': csrfToken },
        body: JSON.stringify({ action: 'START', strategyId, marketId: seedMarketSnapshots()[0]!.marketId }),
      }), env);
      expect(await started.json()).toMatchObject({ ok: true, engineState: 'RUNNING' });
      const order = rawSqlite.prepare(
        'SELECT status, price_micro, fee_micro FROM beta_orders WHERE tenant_id = ?',
      ).get(user.tenantId);
      expect(order).toMatchObject({ status: 'FILLED', price_micro: 460_000 });
      expect(Number(order!.fee_micro)).toBeGreaterThan(0);
      expect(engines.get(user.tenantId)!.storage.getScheduledAlarm()).not.toBeNull();
    } finally {
      rawSqlite.close();
    }
  });

  it.each(['neg-risk-bundle-paper', 'bayesian-fair-value-paper'])(
    'rejects removed legacy strategy %s with 400 VALIDATION_ERROR',
    async (legacyStrategyId) => {
      const { env, rawSqlite } = await createPolyBetaTestHarness();
      try {
        const signup = await worker.fetch(new Request(`${ORIGIN}/api/beta/auth/signup`, {
          method: 'POST', headers: { Origin: ORIGIN, 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: `${legacyStrategyId}@example.com`,
            password: 'Strong#BetaPassword2026!',
            inviteToken: testInviteTokenForEmail(`${legacyStrategyId}@example.com`),
            acknowledgeSimulationAndRisk: true }),
        }), env);
        expect(signup.status).toBe(201);
        const cookie = signup.headers.get('Set-Cookie')!.split(';')[0]!;
        const { csrfToken } = await signup.json() as { csrfToken: string };
        const res = await worker.fetch(new Request(`${ORIGIN}/api/beta/strategy/control`, {
          method: 'POST', headers: { Origin: ORIGIN, 'Content-Type': 'application/json',
            Cookie: cookie, 'X-CSRF-Token': csrfToken },
          body: JSON.stringify({ action: 'START', strategyId: legacyStrategyId, marketId: seedMarketSnapshots()[0]!.marketId }),
        }), env);
        expect(res.status).toBe(400);
        expect(await res.json()).toMatchObject({ code: 'VALIDATION_ERROR' });
      } finally {
        rawSqlite.close();
      }
    },
  );
});
