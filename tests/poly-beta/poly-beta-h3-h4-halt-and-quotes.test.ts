/**
 * POLY-G5 Public Beta — H3 & H4 Regression Tests:
 * - H3a: START refused with HTTP 409 when max_drawdown_bps >= 500 (5% limit)
 * - H3b: PAUSE / STOP do not clear sticky HALTED state
 * - H3c: Auto strategy step halts alarm chain immediately on risk block ($20 exposure)
 * - H4a: Gamma normalizer drops missing/malformed bestBid/bestAsk (never fabricates 0.49/0.51)
 * - H4b: Upstream market quotes older than 30s fail closed (never stamped with fetchedAtMs)
 */

import { describe, expect, it } from 'vitest';
import worker from '../../src/platform/poly-beta/poly-beta-worker';
import { executeSerializedPaperOrder } from '../../src/platform/poly-beta/poly-beta-execution';
import { fetchSupportedBetaMarkets } from '../../src/platform/poly-beta/poly-beta-markets';
import { createPolyBetaTestHarness, seedMarketSnapshots, testInviteTokenForEmail } from './poly-beta-test-harness';

const ORIGIN = 'https://poly-beta-dashboard.pages.dev';

describe('POLY-G5 — H3 Sticky Drawdown Halt & H4 Authentic Market Quotes', () => {
  it('enforces sticky drawdown halts on START/PAUSE/STOP and stops DO alarm when auto-step hits $20 cap', async () => {
    const { env, kv, engines } = await createPolyBetaTestHarness();
    const s = await worker.fetch(
      new Request('https://poly-beta-api.workers.dev/api/beta/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
        body: JSON.stringify({
          email: 'h3-halt@example.com',
          password: 'Strong#BetaPassword2026!',
          inviteToken: testInviteTokenForEmail('h3-halt@example.com'),
          acknowledgeSimulationAndRisk: true,
        }),
      }),
      env,
    );
    const cookie = s.headers.get('Set-Cookie')!.split(';')[0]!;
    const { csrfToken, user } = (await s.json()) as {
      csrfToken: string;
      user: { tenantId: string };
    };
    const hdrs = {
      'Content-Type': 'application/json',
      Origin: ORIGIN,
      Cookie: cookie,
      'X-CSRF-Token': csrfToken,
    };

    // Start engine and run alarm ticks until $20 open exposure cap is hit;
    // verify the DO alarm cancels immediately rather than spinning 180 ticks.
    const startRes = await worker.fetch(
      new Request('https://poly-beta-api.workers.dev/api/beta/strategy/control', {
        method: 'POST',
        headers: hdrs,
        body: JSON.stringify({ action: 'START' }),
      }),
      env,
    );
    expect(startRes.status).toBe(200);

    const engineEntry = engines.get(user.tenantId)!;
    let firedAlarms = 0;
    while (engineEntry.storage.getScheduledAlarm() !== null && firedAlarms < 20) {
      firedAlarms++;
      await engineEntry.instance.alarm();
    }
    expect(firedAlarms).toBeLessThan(10);
    expect(engineEntry.storage.getScheduledAlarm()).toBeNull();
    const paused = await env.POLY_BETA_DB.prepare(
      'SELECT engine_state FROM beta_portfolios WHERE tenant_id = ?',
    ).bind(user.tenantId).first<{ engine_state: string }>();
    expect(paused?.engine_state).toBe('PAUSED');
    const restartAtCap = await worker.fetch(
      new Request('https://poly-beta-api.workers.dev/api/beta/strategy/control', {
        method: 'POST', headers: hdrs, body: JSON.stringify({ action: 'START' }),
      }), env,
    );
    expect(await restartAtCap.json()).toMatchObject({ ok: true, engineState: 'PAUSED' });
    expect(engineEntry.storage.getScheduledAlarm()).toBeNull();

    // Crash mark to trigger >= 500 bps (5%) cumulative drawdown halt
    const snap = seedMarketSnapshots()[0]!;
    await executeSerializedPaperOrder(env.POLY_BETA_DB, {
      tenantId: user.tenantId,
      idempotencyKey: 'extra-exposure-for-dd',
      strategyId: 'toxicity-aware-mm-paper',
      market: snap,
      outcome: 'YES',
      side: 'BUY',
      sizeShares: 5,
      nowMs: Date.now(),
    });
    await kv.put(
      'markets:public:v1',
      JSON.stringify([{ ...snap, bestBid: 0.01, bestAsk: 0.03 }]),
    );
    const pfView = (await (
      await worker.fetch(
        new Request('https://poly-beta-api.workers.dev/api/beta/portfolio', {
          headers: { Origin: ORIGIN, Cookie: cookie },
        }),
        env,
      )
    ).json()) as { engine: { state: string }; summary: { maxDrawdownPct: number } };
    expect(pfView.engine.state).toBe('HALTED');
    expect(pfView.summary.maxDrawdownPct).toBeGreaterThanOrEqual(5);

    // H3b: PAUSE and STOP must preserve HALTED state rather than downgrading it
    for (const action of ['PAUSE', 'STOP'] as const) {
      const ctrl = await worker.fetch(
        new Request('https://poly-beta-api.workers.dev/api/beta/strategy/control', {
          method: 'POST',
          headers: hdrs,
          body: JSON.stringify({ action }),
        }),
        env,
      );
      expect(ctrl.status).toBe(200);
      const body = (await ctrl.json()) as { engineState: string; code: string };
      expect(body.engineState).toBe('HALTED');
      expect(body.code).toBe('HALT_PRESERVED');
    }

    // H3a: START must return HTTP 409 while max_drawdown_bps >= 500
    const blockedStart = await worker.fetch(
      new Request('https://poly-beta-api.workers.dev/api/beta/strategy/control', {
        method: 'POST',
        headers: hdrs,
        body: JSON.stringify({ action: 'START' }),
      }),
      env,
    );
    expect(blockedStart.status).toBe(409);
    const blockedBody = (await blockedStart.json()) as { ok: boolean; code: string };
    expect(blockedBody.ok).toBe(false);
    expect(blockedBody.code).toBe('DRAWDOWN_HALT_LOCKED');

    // Self-service account deletion + fresh signup starts cleanly at $100
    await kv.put('markets:public:v1', JSON.stringify(seedMarketSnapshots()));
    const delRes = await worker.fetch(
      new Request('https://poly-beta-api.workers.dev/api/beta/account', {
        method: 'DELETE',
        headers: hdrs,
      }),
      env,
    );
    expect(delRes.status).toBe(200);
    const reSignup = await worker.fetch(
      new Request('https://poly-beta-api.workers.dev/api/beta/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
        body: JSON.stringify({
          email: 'h3-halt@example.com',
          password: 'Strong#BetaPassword2026!',
          inviteToken: testInviteTokenForEmail('h3-halt@example.com', 'second'),
          acknowledgeSimulationAndRisk: true,
        }),
      }),
      env,
    );
    expect(reSignup.status).toBe(201);
    const cookie2 = reSignup.headers.get('Set-Cookie')!.split(';')[0]!;
    const { csrfToken: csrf2 } = (await reSignup.json()) as { csrfToken: string };
    const restartRes = await worker.fetch(
      new Request('https://poly-beta-api.workers.dev/api/beta/strategy/control', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: ORIGIN,
          Cookie: cookie2,
          'X-CSRF-Token': csrf2,
        },
        body: JSON.stringify({ action: 'START' }),
      }),
      env,
    );
    expect(restartRes.status).toBe(200);
  });

  it('rejects missing/crossed bestBid-bestAsk and fails closed when upstream updatedAt is stale (>30s)', async () => {
    const { env, kv } = await createPolyBetaTestHarness();
    await kv.delete('markets:public:v1');
    const nowMs = 1_760_000_500_000;

    // 1. Markets missing bestBid/bestAsk or crossed/out-of-bounds are dropped (no 0.49/0.51 synthesis)
    const missingQuotes = await fetchSupportedBetaMarkets(env, {
      nowMs,
      fetchImpl: async () =>
        new Response(
          JSON.stringify([
            {
              id: 'no-quotes',
              question: 'Will CPI fall below 2%?',
              clobTokenIds: '["1","2"]',
              outcomePrices: '["0.50","0.50"]',
              updatedAt: new Date(nowMs - 3_000).toISOString(),
              active: true,
            },
            {
              id: 'crossed-book',
              question: 'Will Fed cut in Q3?',
              clobTokenIds: '["3","4"]',
              bestBid: '0.60',
              bestAsk: '0.55',
              updatedAt: new Date(nowMs - 3_000).toISOString(),
              active: true,
            },
          ]),
          { status: 200 },
        ),
    });
    expect(missingQuotes.feedHealthy).toBe(false);
    expect(missingQuotes.markets).toEqual([]);

    // 2. Upstream market with valid quotes but stale updatedAt (>30s) fails closed
    const staleUpstream = await fetchSupportedBetaMarkets(env, {
      nowMs,
      fetchImpl: async () =>
        new Response(
          JSON.stringify([
            {
              id: 'stale-upstream',
              question: 'Will Senate pass budget bill?',
              clobTokenIds: '["5","6"]',
              bestBid: '0.42',
              bestAsk: '0.45',
              updatedAt: new Date(nowMs - 45_000).toISOString(),
              active: true,
            },
          ]),
          { status: 200 },
        ),
    });
    expect(staleUpstream.feedHealthy).toBe(false);
    expect(staleUpstream.markets).toEqual([]);
    expect(staleUpstream.staleReason).toMatch(/stale/i);

    // 3. Cached array with a stale tail element is invalidated and re-fetched
    const freshSnap = seedMarketSnapshots(nowMs);
    const mixedCache = [
      freshSnap[0]!,
      { ...freshSnap[1]!, sourceTimestampMs: nowMs - 60_000 },
    ];
    await kv.put('markets:public:v1', JSON.stringify(mixedCache));
    let refetched = false;
    const afterMixed = await fetchSupportedBetaMarkets(env, {
      nowMs,
      fetchImpl: async () => {
        refetched = true;
        return new Response(
          JSON.stringify([
            {
              id: 'fresh-live',
              question: 'Will ECB hold rates?',
              clobTokenIds: '["7","8"]',
              bestBid: '0.31',
              bestAsk: '0.34',
              updatedAt: new Date(nowMs - 4_000).toISOString(),
              active: true,
            },
          ]),
          { status: 200 },
        );
      },
    });
    expect(refetched).toBe(true);
    expect(afterMixed.feedHealthy).toBe(true);
    expect(afterMixed.markets.map((m) => m.marketId)).toEqual(['fresh-live']);
  });
});
