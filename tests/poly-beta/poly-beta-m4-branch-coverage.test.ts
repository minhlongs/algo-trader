import { describe, expect, it, vi } from 'vitest';
import { ethers } from 'ethers';
import worker from '../../src/platform/poly-beta/poly-beta-worker';
import { buildAuthoritativeDashboardView } from '../../src/platform/poly-beta/poly-beta-dashboard-view';
import { refreshMarksAndDrawdown } from '../../src/platform/poly-beta/poly-beta-ledger';
import { fetchSupportedBetaMarkets } from '../../src/platform/poly-beta/poly-beta-markets';
import { writeMarketNegativeCache } from '../../src/platform/poly-beta/poly-beta-request-guards';
import { loadPendingOrderReservations } from '../../src/platform/poly-beta/poly-beta-order-reservations';
import { settleSerializedPaperMarket } from '../../src/platform/poly-beta/poly-beta-settlement';
import { runEngineStrategyStep, cancelTenantPaperOrder } from '../../src/platform/poly-beta/tenant-paper-engine-actions';
import { TenantPaperEngine, type DoStorageLike } from '../../src/platform/poly-beta/tenant-paper-engine-do';
import type { PolyBetaD1Database } from '../../src/platform/poly-beta/poly-beta-types';
import {
  assertNotFiveMinuteCryptoMarket,
  classifyFiveMinuteExclusion,
} from '../../src/shared/polymarket/five-minute-crypto-guard';
import { ClobV2HeartbeatService } from '../../src/desk/polymarket/clob-v2-heartbeat-service';
import {
  CLOB_V2_EXCHANGE_POLYGON_ADDRESS,
  ZERO_METADATA_BYTES32,
  type ClobV2OrderIntent,
} from '../../src/desk/polymarket/clob-v2-order-surface';
import { Poly1271IsolationError, Poly1271SessionSigner } from '../../src/desk/polymarket/poly1271-session-signer';
import { createRiskGatedOrderGateway } from '../../src/desk/polymarket/poly-settlement-reconciliation-drills';
import { createPolyBetaTestHarness, seedMarketSnapshots, testInviteTokenForEmail } from './poly-beta-test-harness';

const ORIGIN = 'https://poly-beta-dashboard.pages.dev';

describe('POLY-G5 M4 — Per-File >=95% Stmt/Line/Func & >=85% Branch Coverage', () => {
  it('covers malformed JSON mutations, rate-limit 429 branches, missing-cookie auth, and pending SELL reservations', async () => {
    const { env, kv } = await createPolyBetaTestHarness();
    await seedMarketSnapshots(kv);

    // Unauthenticated missing cookie -> 401
    const noCookie = await worker.fetch(new Request('https://poly-beta-api.workers.dev/api/beta/portfolio'), env);
    expect(noCookie.status).toBe(401);

    const signup = await worker.fetch(
      new Request('https://poly-beta-api.workers.dev/api/beta/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
        body: JSON.stringify({
          email: 'm4@example.com',
          password: 'Strong#BetaPassword2026!',
          inviteToken: testInviteTokenForEmail('m4@example.com'),
          acknowledgeSimulationAndRisk: true,
        }),
      }),
      env,
    );
    expect(signup.status).toBe(201);
    const cookie = signup.headers.get('Set-Cookie')!.split(';')[0]!;
    const body = (await signup.json()) as { csrfToken: string; user: { tenantId: string } };
    const hdrs = { Cookie: cookie, 'X-CSRF-Token': body.csrfToken, Origin: ORIGIN, 'Content-Type': 'application/json' };

    // Malformed JSON bodies on all 3 mutation endpoints hit .catch(() => null) -> 400 VALIDATION_ERROR
    for (const p of ['/api/beta/strategy/control', '/api/beta/orders', '/api/beta/positions/settle']) {
      const res = await worker.fetch(
        new Request(`https://poly-beta-api.workers.dev${p}`, { method: 'POST', headers: hdrs, body: '{bad-json' }),
        env,
      );
      expect(res.status).toBe(400);
    }

    // Open YES position, place resting SELL order on same token + resting SELL on another token
    await worker.fetch(
      new Request('https://poly-beta-api.workers.dev/api/beta/orders', {
        method: 'POST',
        headers: hdrs,
        body: JSON.stringify({
          idempotencyKey: 'm4-buy-yes',
          marketId: 'mkt-fed-rate-2026',
          outcome: 'YES',
          side: 'BUY',
          sizeShares: 10,
          limitPrice: 0.5,
        }),
      }),
      env,
    );
    await worker.fetch(
      new Request('https://poly-beta-api.workers.dev/api/beta/orders', {
        method: 'POST',
        headers: hdrs,
        body: JSON.stringify({
          idempotencyKey: 'm4-sell-rest',
          marketId: 'mkt-fed-rate-2026',
          outcome: 'YES',
          side: 'SELL',
          sizeShares: 5,
          limitPrice: 0.9,
        }),
      }),
      env,
    );
    const resMatch = await loadPendingOrderReservations(env.POLY_BETA_DB, body.user.tenantId, 'tok_fed_yes');
    expect(resMatch.sellSharesMicro).toBe(5_000_000);
    const resOther = await loadPendingOrderReservations(env.POLY_BETA_DB, body.user.tenantId, 'tok_other');
    expect(resOther.sellSharesMicro).toBe(0);

    // Rate limit 429 on markets, portfolio read, mutations, and account delete (KV fallback path)
    const kvFallbackEnv = { ...env, TENANT_PAPER_ENGINE: undefined as unknown as typeof env.TENANT_PAPER_ENGINE };
    const nowBucket = Math.floor(Date.now() / 60_000);
    await kv.put(`rl:markets:anon:${nowBucket}`, '60');
    expect((await worker.fetch(new Request('https://poly-beta-api.workers.dev/api/beta/markets'), kvFallbackEnv)).status).toBe(429);

    await kv.put(`rl:pf:${body.user.tenantId}:${nowBucket}`, '90');
    expect(
      (await worker.fetch(new Request('https://poly-beta-api.workers.dev/api/beta/portfolio', { headers: { Cookie: cookie } }), kvFallbackEnv)).status,
    ).toBe(429);

    await kv.put(`rl:mut:${body.user.tenantId}:${nowBucket}`, '30');
    expect(
      (await worker.fetch(new Request('https://poly-beta-api.workers.dev/api/beta/strategy/control', { method: 'POST', headers: hdrs, body: '{"action":"PAUSE"}' }), kvFallbackEnv)).status,
    ).toBe(429);

    await kv.put(`rl:acct:${body.user.tenantId}:${nowBucket}`, '5');
    expect(
      (await worker.fetch(new Request('https://poly-beta-api.workers.dev/api/beta/account', { method: 'DELETE', headers: hdrs }), kvFallbackEnv)).status,
    ).toBe(429);
  });

  it('covers DO malformed JSON, alarm error boundary, unhealthy feed halt, losing settlement, and empty D1 results fallbacks', async () => {
    const { env, kv } = await createPolyBetaTestHarness();
    const signup = await worker.fetch(
      new Request('https://poly-beta-api.workers.dev/api/beta/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
        body: JSON.stringify({
          email: 'm4-do@example.com',
          password: 'Strong#BetaPassword2026!',
          inviteToken: testInviteTokenForEmail('m4-do@example.com'),
          acknowledgeSimulationAndRisk: true,
        }),
      }),
      env,
    );
    const { user } = (await signup.json()) as { user: { tenantId: string } };
    const tenantId = user.tenantId;

    // Market negative cache path without fetchImpl + invalid JSON string in clobTokenIds
    const nowMs = Date.now();
    await kv.delete('markets:public:v1');
    await writeMarketNegativeCache(env, 'Upstream market fetch failed', nowMs);
    const negHit = await fetchSupportedBetaMarkets(env, { nowMs });
    expect(negHit.feedHealthy).toBe(false);
    expect(negHit.staleReason).toBe('Upstream market fetch failed');

    // Corrupt JSON array string & non-array JSON string in Gamma response
    const badTokens = await fetchSupportedBetaMarkets(env, {
      nowMs,
      fetchImpl: async () =>
        new Response(
          JSON.stringify([
            { id: 'm-bad-tok', question: 'Bad tok?', clobTokenIds: '[invalid', outcomePrices: '123', bestBid: 0.4, bestAsk: 0.5, active: true },
          ]),
          { status: 200 },
        ),
    });
    expect(badTokens.feedHealthy).toBe(false);

    // Non-array, non-string `clobTokenIds` (e.g. a number) falls through parseJsonArrayString
    const oddTokenType = await fetchSupportedBetaMarkets(env, {
      nowMs,
      fetchImpl: async () =>
        new Response(
          JSON.stringify([
            { id: 'm-odd-type', question: 'Odd type?', clobTokenIds: 12345, outcomePrices: '123', bestBid: 0.4, bestAsk: 0.5, active: true },
          ]),
          { status: 200 },
        ),
    });
    expect(oddTokenType.feedHealthy).toBe(false);

    // Negative cache write failure (.catch(() => {}))
    const failKvEnv = {
      ...env,
      POLY_BETA_KV: { ...kv, async put() { throw new Error('kv-put-fail'); } },
    };
    const netFail = await fetchSupportedBetaMarkets(failKvEnv, {
      nowMs,
      fetchImpl: async () => { throw new Error('net-down'); },
    });
    expect(netFail.feedHealthy).toBe(false);

    // runEngineStrategyStep fallback market (bestAsk > 0.85, non-matching selected_market_id, empty selected_strategy_id)
    await kv.put(
      'markets:public:v1',
      JSON.stringify([
        {
          marketId: 'mkt-extreme-ask',
          question: 'Will macro rate exceed 3% in Q4 2026?',
          slug: 'macro-rate-q4-2026',
          category: 'Macroeconomics',
          yesTokenId: 'tok_ext_yes',
          noTokenId: 'tok_ext_no',
          bestBid: 0.88,
          bestAsk: 0.9,
          midPrice: 0.89,
          spreadBps: 225,
          feeRateBps: 0,
          tickSize: 0.01,
          minOrderShares: 5,
          source: 'polymarket-gamma-clob',
          sourceTimestampMs: nowMs - 1000,
          fetchedAtMs: nowMs,
        },
      ]),
    );
    await env.POLY_BETA_DB.prepare(
      `UPDATE beta_portfolios SET selected_market_id = 'mkt-other', selected_strategy_id = '' WHERE tenant_id = ?`,
    ).bind(tenantId).run();

    const memStore = new Map<string, unknown>();
    const storage: DoStorageLike = {
      async get<T>(k: string) { return memStore.get(k) as T | undefined; },
      async put(k, v) { memStore.set(k, v); },
      async deleteAll() { memStore.clear(); },
      async setAlarm() {},
      async deleteAlarm() {},
    };
    expect(await runEngineStrategyStep(storage, env, tenantId, nowMs)).toBe(true);

    // runEngineStrategyStep halts when feed is unhealthy (via negative cache)
    await kv.delete('markets:public:v1');
    await writeMarketNegativeCache(env, 'Upstream market fetch failed', nowMs);
    const haltedRes = await runEngineStrategyStep(storage, env, tenantId, nowMs);
    expect(haltedRes).toBe(false);
    // Calling again while already HALTED returns false immediately
    expect(await runEngineStrategyStep(storage, env, tenantId, nowMs)).toBe(false);

    // cancelTenantPaperOrder on non-existent order -> 404, and on already FILLED order -> 200 idempotent
    expect((await cancelTenantPaperOrder(env, tenantId, 'ord_missing', nowMs)).status).toBe(404);
    const filledOrd = await env.POLY_BETA_DB.prepare(`SELECT order_id FROM beta_orders WHERE tenant_id = ? LIMIT 1`).bind(tenantId).first<{ order_id: string }>();
    if (filledOrd) {
      expect((await cancelTenantPaperOrder(env, tenantId, filledOrd.order_id, nowMs)).status).toBe(200);
    }

    // DO malformed JSON body -> 400; unknown route -> 404; empty-tenant alarm; alarm error boundary (both with & without tenantId & throwing DB); NO outcome order
    const doInstance = new TenantPaperEngine({ storage }, env);
    await expect(doInstance.alarm()).resolves.toBeUndefined(); // !tenantId branch
    expect((await doInstance.fetch(new Request('https://poly-beta.internal/control', { method: 'POST', body: '{bad' }))).status).toBe(400);
    expect((await doInstance.fetch(new Request('https://poly-beta.internal/unknown', { method: 'POST', body: JSON.stringify({ tenantId }) }))).status).toBe(404);
    await kv.delete('markets:neg:v1');
    await kv.put('markets:public:v1', JSON.stringify(seedMarketSnapshots(nowMs)));
    await env.POLY_BETA_DB.prepare(`UPDATE beta_portfolios SET engine_state = 'STOPPED', halt_reason = NULL WHERE tenant_id = ?`).bind(tenantId).run();
    expect(
      (await doInstance.fetch(
        new Request('https://poly-beta.internal/order', {
          method: 'POST',
          body: JSON.stringify({ tenantId, idempotencyKey: 'do-no-1', marketId: 'mkt-fed-rate-2026', outcome: 'NO', side: 'BUY', sizeShares: 5, limitPrice: 0.6 }),
        }),
      )).status,
    ).toBe(200);

    const throwingDbEnv = {
      ...env,
      POLY_BETA_DB: { prepare() { throw new Error('db-down'); } } as unknown as PolyBetaD1Database,
    };
    const throwingStorageWithTenant: DoStorageLike = {
      async get<T>(k: string) {
        if (k === 'tenantId') return tenantId as T;
        throw new Error('storage-failure');
      },
      async put() {},
      async deleteAll() {},
      async setAlarm() {},
      async deleteAlarm() {},
    };
    await expect(new TenantPaperEngine({ storage: throwingStorageWithTenant }, throwingDbEnv).alarm()).resolves.toBeUndefined();
    const throwingStorageNoTenant: DoStorageLike = {
      async get() { throw new Error('storage-first-read-fail'); },
      async put() {},
      async deleteAll() {},
      async setAlarm() {},
      async deleteAlarm() {},
    };
    await expect(new TenantPaperEngine({ storage: throwingStorageNoTenant }, env).alarm()).resolves.toBeUndefined();

    // Insert NO position, refreshMarksAndDrawdown with NO outcome + missing market snapshot + zero peak equity, then settle losing outcome (YES wins)
    await env.POLY_BETA_DB.prepare(
      `INSERT INTO beta_positions (tenant_id, market_id, token_id, market_question, outcome, shares_micro, avg_entry_micro, mark_price_micro, unrealized_micro, updated_at_ms)
       VALUES (?, 'mkt-eu-inflation-2026', 'tok_eu_no', 'EU CPI?', 'NO', 5000000, 500000, 500000, 0, ?)`,
    ).bind(tenantId, nowMs).run();
    const feedOk = await fetchSupportedBetaMarkets(env);
    await refreshMarksAndDrawdown(env.POLY_BETA_DB, tenantId, new Map(feedOk.markets.map((m) => [m.marketId, m])), nowMs);
    // Refresh again when mark unchanged + missing market snapshot
    await refreshMarksAndDrawdown(env.POLY_BETA_DB, tenantId, new Map(), nowMs);

    const loseSettle = await settleSerializedPaperMarket(env.POLY_BETA_DB, tenantId, 'mkt-eu-inflation-2026', 'YES', nowMs);
    expect(loseSettle.settledCount).toBe(1);
    expect(loseSettle.settledDeltaMicro).toBe(-2_500_000);
    // Settling market with no open positions returns 0
    const emptySettle = await settleSerializedPaperMarket(env.POLY_BETA_DB, tenantId, 'mkt-eu-inflation-2026', 'NO', nowMs);
    expect(emptySettle.settledCount).toBe(0);

    // D1 wrapper returning undefined `results` exercises `?? []` defensive fallbacks in dashboard-view and ledger
    const undefResultsDb: PolyBetaD1Database = {
      prepare(q: string) {
        return {
          bind(...vals: unknown[]) {
            const inner = env.POLY_BETA_DB.prepare(q).bind(...vals);
            return {
              first: () => inner.first(),
              run: () => inner.run(),
              all: async () => ({ results: undefined as unknown as never[] }),
            };
          },
        };
      },
    };
    const snap = await buildAuthoritativeDashboardView(undefResultsDb, tenantId, [], true, null, nowMs);
    expect(snap.orders).toEqual([]);
    expect((await loadPendingOrderReservations(undefResultsDb, tenantId, 'tok_fed_yes')).buyNotionalMicro).toBe(0);
    expect((await settleSerializedPaperMarket(undefResultsDb, tenantId, 'mkt-fed-rate-2026', 'YES', nowMs)).settledCount).toBe(0);

    // Null `first()` rows in settleSerializedPaperMarket exercise `pf?.cash_balance_micro ?? 0`, `pf?.selected_strategy_id ?? ...`, and `seqRow?.max_seq ?? 0`
    const freshSignup = await worker.fetch(
      new Request('https://poly-beta-api.workers.dev/api/beta/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
        body: JSON.stringify({
          email: 'm4-null@example.com',
          password: 'Strong#BetaPassword2026!',
          inviteToken: testInviteTokenForEmail('m4-null@example.com'),
          acknowledgeSimulationAndRisk: true,
        }),
      }),
      env,
    );
    const freshTenant = ((await freshSignup.json()) as { user: { tenantId: string } }).user.tenantId;
    const nullFirstSettleDb: PolyBetaD1Database = {
      prepare(q: string) {
        const isPfCash = q.includes('SELECT cash_balance_micro, selected_strategy_id FROM beta_portfolios');
        const isSeq = q.includes('COALESCE(MAX(seq), 0) AS max_seq');
        const isMktPos = q.includes('AND market_id = ? AND shares_micro > 0');
        return {
          bind(...vals: unknown[]) {
            const inner = env.POLY_BETA_DB.prepare(q).bind(...vals);
            return {
              first: async () =>
                isPfCash || isSeq
                  ? null
                  : ((await inner.first()) as never),
              run: () => inner.run(),
              all: async () =>
                isMktPos
                  ? ({
                      results: [
                        {
                          tenant_id: freshTenant,
                          market_id: 'mkt-null-pf',
                          token_id: 'tok_null_yes',
                          market_question: 'Null pf?',
                          outcome: 'YES' as const,
                          shares_micro: 1_000_000,
                          avg_entry_micro: 500_000,
                          mark_price_micro: 500_000,
                          unrealized_micro: 0,
                          updated_at_ms: nowMs,
                        },
                      ],
                    } as never)
                  : ((await inner.all()) as never),
            };
          },
        };
      },
    };
    await env.POLY_BETA_DB.prepare(`DELETE FROM beta_ledger_entries WHERE tenant_id = ?`).bind(freshTenant).run();
    const nullPfSettle = await settleSerializedPaperMarket(nullFirstSettleDb, freshTenant, 'mkt-null-pf', 'YES', nowMs);
    expect(nullPfSettle.settledCount).toBe(1);
    expect(nullPfSettle.settledDeltaMicro).toBe(500_000);
  });

  it('covers 5-minute guard edge branches, heartbeat start/stop/extract, Poly1271 remote signer guards, and drill kill-cancel', async () => {
    // 5-minute guard branches: null target, binary settlement phrase, empty text with child markets, fallback contextLabel
    expect(classifyFiveMinuteExclusion(null)).toBeNull();
    expect(classifyFiveMinuteExclusion({ question: '5-minute binary price settlement window' })).toBe(
      'five-minute-binary-settlement-contract',
    );
    expect(classifyFiveMinuteExclusion({ markets: [{ question: 'Normal macro question' }, { durationSeconds: 300 }] })).toBe(
      'explicit-300s-settlement-window',
    );
    expect(() => assertNotFiveMinuteCryptoMarket({ question: 'Safe macro' })).not.toThrow();
    expect(() => assertNotFiveMinuteCryptoMarket({ durationSeconds: 300 }, 'ctx-fallback')).toThrow(/ctx-fallback/);
    expect(() => assertNotFiveMinuteCryptoMarket({ durationSeconds: 300 })).toThrow(/unknown-market/);

    // ClobV2HeartbeatService: start/stop idempotency, camelCase heartbeatID, empty body ACK, non-Error rejection
    vi.useFakeTimers();
    try {
      let call = 0;
      const hb = new ClobV2HeartbeatService({
        intervalMs: 1_000,
        fetchImpl: async (_url, init) => {
          call += 1;
          if (call === 1) return new Response(JSON.stringify({ heartbeatID: 'hb-camel-1' }), { status: 200 });
          if (call === 2) return new Response('', { status: 200 });
          if (call === 3) throw 'string-network-error';
          return new Promise((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => reject(new Error('heartbeat-timeout')));
          });
        },
      });
      hb.start();
      hb.start(); // idempotent second start
      expect(hb.getTelemetry().running).toBe(true);
      const r1 = await hb.beatOnce();
      expect(r1.heartbeatId).toBe('hb-camel-1');
      const r2 = await hb.beatOnce();
      expect(r2.ok).toBe(true);
      const r3 = await hb.beatOnce();
      expect(r3.error).toBe('string-network-error');
      await vi.advanceTimersByTimeAsync(2_000); // fires interval callback + abort timeout
      hb.stop();
      hb.stop(); // idempotent second stop
      expect(hb.getTelemetry().running).toBe(false);
    } finally {
      vi.useRealTimers();
    }

    // Poly1271SessionSigner: remote signer invalid signature recovery + AbstractSigner forbidden methods + default nowSec
    const wallet = new ethers.Wallet('0x0123456789012345678901234567890123456789012345678901234567890123');
    const badRemote = new Poly1271SessionSigner({
      depositWalletAddress: '0x1111111111111111111111111111111111111111',
      verifyingContract: CLOB_V2_EXCHANGE_POLYGON_ADDRESS,
      sessionSignerAddress: wallet.address,
      domainVersion: '3',
      sessionExpiresAtSec: Math.floor(Date.now() / 1000) + 3600,
      remoteSignTypedData: async () => '0xdeadbeef',
      runtimeEnv: {},
    });
    const internalSigner = (badRemote as unknown as { signer: ethers.Signer }).signer;
    expect(internalSigner.connect(null)).toBe(internalSigner);
    await expect(internalSigner.signTransaction({})).rejects.toThrow(/forbids raw L1\/L2 tx/);
    await expect(internalSigner.signMessage('hi')).rejects.toThrow(/EIP-712 only/);

    const intent: ClobV2OrderIntent = {
      salt: 42n,
      tokenId: 1001n,
      makerAmount: 10_000_000n,
      takerAmount: 20_000_000n,
      side: 0,
      expiration: 0n,
      nonce: 1n,
      feeRateBps: 0,
      metadata: ZERO_METADATA_BYTES32,
    };
    await expect(badRemote.signOrder(intent)).rejects.toThrow(Poly1271IsolationError);

    // Reconciliation drills: open SELL order, open position count, on-chain extra token mismatch, and killSwitch cancelling open SUBMITTED order
    const gw = createRiskGatedOrderGateway(100);
    const ctx = { nowMs: 1_760_000_000_000, observedAtMs: 1_760_000_000_000, feeRateBps: 100, maxNotionalUsd: 25, currentDrawdownPct: 0 };
    expect(
      gw.submitRiskGatedOrder(
        { intentId: 'i-open-1', orderId: 'o-open-1', marketId: 'm1', tokenId: 't1', side: 'SELL', requestedSize: 5, limitPrice: 0.5, timestamp: ctx.nowMs },
        ctx,
      ).ok,
    ).toBe(true);
    const mm = gw.reconcileWithOnChainBalances({ 't-untracked': 3 });
    expect(mm.reconciled).toBe(false);
    await new Promise((r) => setTimeout(r, 10));
    expect(gw.reconciler.getOrder('o-open-1')?.status).toBe('CANCELLED');

    // Rejecting killSwitch.fire exercises .catch(() => undefined) on drawdown & mismatch
    const gw2 = createRiskGatedOrderGateway(100);
    gw2.killSwitch.fire = async () => { throw new Error('fire-fail'); };
    expect(
      gw2.submitRiskGatedOrder(
        { intentId: 'i-dd', orderId: 'o-dd', marketId: 'm1', tokenId: 't1', side: 'BUY', requestedSize: 5, limitPrice: 0.5, timestamp: ctx.nowMs },
        { ...ctx, currentDrawdownPct: 10 },
      ).ok,
    ).toBe(false);
    expect(gw2.reconcileWithOnChainBalances({ 't-extra': 1 }).reconciled).toBe(false);
    await new Promise((r) => setTimeout(r, 10));
  });
});
