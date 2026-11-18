import { describe, expect, it } from 'vitest';
import worker from '../../src/platform/poly-beta/poly-beta-worker';
import { createPolyBetaTestHarness, seedMarketSnapshots } from './poly-beta-test-harness';

const ORIGIN = 'https://poly-beta-dashboard.pages.dev';

describe('Beta execution harness variants', () => {
  it.each([
    ['toxicity-aware-mm-paper', 'FILLED', 460_000],
    ['neg-risk-bundle-paper', 'PENDING', 440_000],
    ['bayesian-fair-value-paper', 'PENDING', 430_000],
  ])('%s places the disclosed order type and price', async (strategyId, status, priceMicro) => {
    const { env, rawSqlite, engines } = await createPolyBetaTestHarness();
    try {
      const signup = await worker.fetch(new Request(`${ORIGIN}/api/beta/auth/signup`, {
        method: 'POST', headers: { Origin: ORIGIN, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: `${strategyId}@example.com`,
          password: 'Strong#BetaPassword2026!', acknowledgeSimulationAndRisk: true }),
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
      expect(order).toMatchObject({ status, price_micro: priceMicro });
      if (status === 'PENDING') expect(order!.fee_micro).toBe(0);
      else expect(Number(order!.fee_micro)).toBeGreaterThan(0);
      expect(engines.get(user.tenantId)!.storage.getScheduledAlarm()).not.toBeNull();
    } finally {
      rawSqlite.close();
    }
  });
});
