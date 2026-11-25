import { describe, expect, it } from 'vitest';
import worker from '../../src/platform/poly-beta/poly-beta-worker';
import type { PolyBetaEnv } from '../../src/platform/poly-beta/poly-beta-types';
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

describe('Paper Beta provenance, risk caps, maintenance, and live-lock guards', () => {
  it('enforces risk caps, stale market halt, sticky HALTED, LIVE_TRADING_ENABLED=true 503, and discloses marketDataProvenance', async () => {
    const { env, rawSqlite, kv } = await createPolyBetaTestHarness();
    try {
      const alice = await signupTenant(env, 'alice@example.com');
      const market = seedMarketSnapshots()[0]!;

      const pfRes = await worker.fetch(
        new Request(`${ORIGIN}/api/beta/portfolio`, { method: 'GET', headers: { Origin: ORIGIN, Cookie: alice.cookie } }),
        env,
      );
      expect(pfRes.status).toBe(200);
      const pfJson = (await pfRes.json()) as { health: { marketDataProvenance: Record<string, unknown> } };
      expect(pfJson.health.marketDataProvenance).toEqual({
        gammaApi: 'https://gamma-api.polymarket.com',
        clobApi: 'https://clob.polymarket.com',
        stalenessLimitMs: 30_000,
        accountingCurrency: 'USD',
        dataRightsStatus: 'HOLD',
        mode: 'READ_ONLY_PUBLIC_PAPER_FEED',
      });

      const capRes = await worker.fetch(
        new Request(`${ORIGIN}/api/beta/orders`, {
          method: 'POST',
          headers: alice.headers,
          body: JSON.stringify({ idempotencyKey: 'single-cap-1', marketId: market.marketId, outcome: 'YES', side: 'BUY', sizeShares: 20 }),
        }),
        env,
      );
      expect(capRes.status).toBe(422);
      expect(await capRes.json()).toMatchObject({ ok: false, code: 'SINGLE_ORDER_CAP' });

      for (let i = 1; i <= 4; i++) {
        const okOrd = await worker.fetch(
          new Request(`${ORIGIN}/api/beta/orders`, {
            method: 'POST',
            headers: alice.headers,
            body: JSON.stringify({ idempotencyKey: `exp-ok-${i}`, marketId: market.marketId, outcome: 'YES', side: 'BUY', sizeShares: 10 }),
          }),
          env,
        );
        expect(okOrd.status).toBe(200);
      }
      const expCap = await worker.fetch(
        new Request(`${ORIGIN}/api/beta/orders`, {
          method: 'POST',
          headers: alice.headers,
          body: JSON.stringify({ idempotencyKey: 'exp-cap-5', marketId: market.marketId, outcome: 'YES', side: 'BUY', sizeShares: 10 }),
        }),
        env,
      );
      expect(expCap.status).toBe(422);
      expect(await expCap.json()).toMatchObject({ ok: false, code: 'MAX_EXPOSURE_CAP' });

      const staleMarkets = seedMarketSnapshots(Date.now() - 60_000);
      await kv.put('markets:public:v1', JSON.stringify(staleMarkets));
      const staleOrd = await worker.fetch(
        new Request(`${ORIGIN}/api/beta/orders`, {
          method: 'POST',
          headers: alice.headers,
          body: JSON.stringify({ idempotencyKey: 'stale-ord-1', marketId: market.marketId, outcome: 'YES', side: 'BUY', sizeShares: 5 }),
        }),
        env,
      );
      expect(staleOrd.status).toBe(503);
      const stopWhileHalted = await worker.fetch(
        new Request(`${ORIGIN}/api/beta/strategy/control`, { method: 'POST', headers: alice.headers, body: JSON.stringify({ action: 'STOP' }) }),
        env,
      );
      expect(await stopWhileHalted.json()).toMatchObject({ ok: true, engineState: 'HALTED', code: 'HALT_PRESERVED' });

      const liveGuard = await worker.fetch(new Request(`${ORIGIN}/api/health`, { method: 'GET' }), { ...env, LIVE_TRADING_ENABLED: 'true' });
      expect(liveGuard.status).toBe(503);
      expect(await liveGuard.json()).toMatchObject({ code: 'LIVE_TRADING_FORBIDDEN_IN_BETA' });
    } finally {
      rawSqlite.close();
    }
  });

  it('halts authenticated API routes and pauses DO alarms under MAINTENANCE_MODE or LIVE_TRADING_ENABLED=true', async () => {
    const { env, rawSqlite, engines } = await createPolyBetaTestHarness();
    try {
      const alice = await signupTenant(env, 'alice@example.com');
      const market = seedMarketSnapshots()[0]!;
      const startRes = await worker.fetch(
        new Request(`${ORIGIN}/api/beta/strategy/control`, {
          method: 'POST',
          headers: alice.headers,
          body: JSON.stringify({ action: 'START', marketId: market.marketId }),
        }),
        env,
      );
      expect(startRes.status).toBe(200);
      const ordersBefore = (
        rawSqlite.prepare(`SELECT COUNT(*) AS cnt FROM beta_orders WHERE tenant_id = ?`).get(alice.tenantId) as { cnt: number }
      ).cnt;

      const maintEnv = { ...env, MAINTENANCE_MODE: 'true' };
      const blockedPortfolio = await worker.fetch(
        new Request(`${ORIGIN}/api/beta/portfolio`, { method: 'GET', headers: { Origin: ORIGIN, Cookie: alice.cookie } }),
        maintEnv,
      );
      expect(blockedPortfolio.status).toBe(503);
      expect(await blockedPortfolio.json()).toMatchObject({ code: 'MAINTENANCE_MODE' });
      expect((await worker.fetch(new Request(`${ORIGIN}/api/health`, { method: 'GET' }), maintEnv)).status).toBe(200);

      const doEntry = engines.get(alice.tenantId)!;
      env.MAINTENANCE_MODE = 'true';
      await doEntry.instance.alarm();

      expect(
        (rawSqlite.prepare(`SELECT engine_state FROM beta_portfolios WHERE tenant_id = ?`).get(alice.tenantId) as { engine_state: string }).engine_state,
      ).toBe('PAUSED');
      expect(doEntry.storage.getScheduledAlarm()).toBeNull();
      expect(
        (rawSqlite.prepare(`SELECT COUNT(*) AS cnt FROM beta_orders WHERE tenant_id = ?`).get(alice.tenantId) as { cnt: number }).cnt,
      ).toBe(ordersBefore);
      expect(rawSqlite.prepare(`SELECT event_code FROM beta_execution_logs WHERE tenant_id = ? AND event_code = 'MAINTENANCE_MODE'`).get(alice.tenantId)).toBeTruthy();

      env.MAINTENANCE_MODE = 'false';
      env.LIVE_TRADING_ENABLED = 'true';
      rawSqlite.prepare(`UPDATE beta_portfolios SET engine_state = 'RUNNING' WHERE tenant_id = ?`).run(alice.tenantId);
      await doEntry.storage.setAlarm(Date.now() + 10_000);
      await doEntry.instance.alarm();

      expect(
        (rawSqlite.prepare(`SELECT engine_state FROM beta_portfolios WHERE tenant_id = ?`).get(alice.tenantId) as { engine_state: string }).engine_state,
      ).toBe('PAUSED');
      expect(doEntry.storage.getScheduledAlarm()).toBeNull();
      expect(
        rawSqlite.prepare(`SELECT event_code FROM beta_execution_logs WHERE tenant_id = ? AND event_code = 'LIVE_TRADING_FORBIDDEN_IN_BETA'`).get(alice.tenantId),
      ).toBeTruthy();

      env.LIVE_TRADING_ENABLED = 'false';
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
