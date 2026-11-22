import { describe, expect, it } from 'vitest';
import worker from '../../src/platform/poly-beta/poly-beta-worker';
import type { PolyBetaMarketSnapshot } from '../../src/platform/poly-beta/poly-beta-types';
import { createPolyBetaTestHarness, testInviteTokenForEmail } from './poly-beta-test-harness';

const ORIGIN = 'https://poly-beta-dashboard.pages.dev';

function extractCookieValue(setCookie: string | null): string {
  expect(setCookie).toBeTruthy();
  return setCookie!.split(';')[0]!;
}

function makeFreshSnapshot(nowMs: number): PolyBetaMarketSnapshot {
  return {
    marketId: 'mkt-atomic-audit-2026',
    question: 'Will the US 10Y Treasury yield close below 4.00% on Dec 31, 2026?',
    slug: 'us-treasury-yield-below-4pct-dec-2026',
    category: 'Macroeconomics',
    yesTokenId: 'tok_yes_atomic',
    noTokenId: 'tok_no_atomic',
    bestBid: 0.48,
    bestAsk: 0.50,
    midPrice: 0.49,
    spreadBps: 408,
    feeRateBps: 0,
    tickSize: 0.01,
    minOrderShares: 5,
    source: 'polymarket-gamma-clob',
    sourceTimestampMs: nowMs - 1_000,
    fetchedAtMs: nowMs - 500,
  };
}

describe('POLY-G5 — Round-2 Audit Regressions (Atomic D1 Batch, Read-Only GET, Guards, Drill Tag)', () => {
  it('enforces 415 Content-Type, 413 streamed body cap, read-only GET portfolio, [SIMULATED_DRILL] tag, and atomic D1 rollback', async () => {
    const { env, rawSqlite: rawDb } = await createPolyBetaTestHarness();
    const nowMs = Date.now();
    const snap = makeFreshSnapshot(nowMs);
    await env.POLY_BETA_KV.put('markets:public:v1', JSON.stringify([snap]));

    // 1. 415 Unsupported Media Type when Content-Type is missing/text/plain
    const wrongCt = await worker.fetch(
      new Request('https://poly-beta-api.workers.dev/api/beta/auth/signup', {
        method: 'POST',
        headers: { Origin: ORIGIN, 'Content-Type': 'text/plain' },
        body: '{}',
      }),
      env,
    );
    expect(wrongCt.status).toBe(415);

    // 2. 413 Payload Too Large on streamed body > 16 KB (even without Content-Length header)
    const bigStream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{"pad":"' + 'x'.repeat(17_000) + '"}'));
        controller.close();
      },
    });
    const tooLarge = await worker.fetch(
      new Request('https://poly-beta-api.workers.dev/api/beta/auth/signup', {
        method: 'POST',
        headers: { Origin: ORIGIN, 'Content-Type': 'application/json' },
        body: bigStream,
        // @ts-expect-error Node/Fetch duplex streaming option
        duplex: 'half',
      }),
      env,
    );
    expect(tooLarge.status).toBe(413);

    // 3. Provision tenant and place a BUY order
    const signup = await worker.fetch(
      new Request('https://poly-beta-api.workers.dev/api/beta/auth/signup', {
        method: 'POST',
        headers: { Origin: ORIGIN, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'atomic-audit@example.com',
          password: 'AuditSafePassword!99',
          inviteToken: testInviteTokenForEmail('atomic-audit@example.com'),
          acknowledgeSimulationAndRisk: true,
        }),
      }),
      env,
    );
    expect(signup.status).toBe(201);
    const cookie = extractCookieValue(signup.headers.get('Set-Cookie'));
    const {
      csrfToken,
      user: { tenantId },
    } = (await signup.json()) as { csrfToken: string; user: { tenantId: string } };
    const hdrs = {
      Origin: ORIGIN,
      Cookie: cookie,
      'Content-Type': 'application/json',
      'X-CSRF-Token': csrfToken,
    };

    const buyRes = await worker.fetch(
      new Request('https://poly-beta-api.workers.dev/api/beta/orders', {
        method: 'POST',
        headers: hdrs,
        body: JSON.stringify({
          idempotencyKey: 'atomic-buy-1',
          strategyId: 'toxicity-aware-mm-paper',
          marketId: snap.marketId,
          outcome: 'YES',
          side: 'BUY',
          sizeShares: 10,
        }),
      }),
      env,
    );
    expect(buyRes.status).toBe(200);

    // 4. Read-only GET /api/beta/portfolio: crash quote in KV and verify D1 rows are NOT mutated by GET
    const beforePos = rawDb
      .prepare('SELECT mark_price_micro, updated_at_ms FROM beta_positions WHERE tenant_id = ?')
      .get(tenantId) as { mark_price_micro: number; updated_at_ms: number };
    const beforeLogs = (
      rawDb.prepare('SELECT COUNT(*) AS c FROM beta_execution_logs WHERE tenant_id = ?').get(tenantId) as { c: number }
    ).c;

    await env.POLY_BETA_KV.put(
      'markets:public:v1',
      JSON.stringify([{ ...snap, bestBid: 0.12, bestAsk: 0.14 }]),
    );

    const getView = await worker.fetch(
      new Request('https://poly-beta-api.workers.dev/api/beta/portfolio', {
        headers: { Origin: ORIGIN, Cookie: cookie },
      }),
      env,
    );
    expect(getView.status).toBe(200);
    const afterPos = rawDb
      .prepare('SELECT mark_price_micro, updated_at_ms FROM beta_positions WHERE tenant_id = ?')
      .get(tenantId) as { mark_price_micro: number; updated_at_ms: number };
    const afterLogs = (
      rawDb.prepare('SELECT COUNT(*) AS c FROM beta_execution_logs WHERE tenant_id = ?').get(tenantId) as { c: number }
    ).c;
    expect(afterPos.mark_price_micro).toBe(beforePos.mark_price_micro);
    expect(afterLogs).toBe(beforeLogs);

    // Restore healthy market quote
    await env.POLY_BETA_KV.put('markets:public:v1', JSON.stringify([snap]));

    // 5. Reject malformed settle payload (whitespace / invalid chars in marketId)
    const badSettle = await worker.fetch(
      new Request('https://poly-beta-api.workers.dev/api/beta/positions/settle', {
        method: 'POST',
        headers: hdrs,
        body: JSON.stringify({ marketId: 'bad market id!', winningOutcome: 'YES' }),
      }),
      env,
    );
    expect(badSettle.status).toBe(400);

    // 6. Atomic D1 batch rollback: install a temporary SQLite BEFORE INSERT trigger on beta_ledger_entries
    // that aborts mid-batch during order fill, verifying beta_positions and beta_orders roll back cleanly!
    rawDb.exec(`
      CREATE TRIGGER fail_ledger_once BEFORE INSERT ON beta_ledger_entries
      BEGIN
        SELECT RAISE(ABORT, 'simulated_mid_batch_d1_failure');
      END;
    `);
    const sharesBeforeAbort = (
      rawDb.prepare('SELECT shares_micro FROM beta_positions WHERE tenant_id = ?').get(tenantId) as { shares_micro: number }
    ).shares_micro;
    const ordersBeforeAbort = (
      rawDb.prepare('SELECT COUNT(*) AS c FROM beta_orders WHERE tenant_id = ?').get(tenantId) as { c: number }
    ).c;

    const abortedOrder = await worker.fetch(
      new Request('https://poly-beta-api.workers.dev/api/beta/orders', {
        method: 'POST',
        headers: hdrs,
        body: JSON.stringify({
          idempotencyKey: 'atomic-buy-rollback',
          strategyId: 'toxicity-aware-mm-paper',
          marketId: snap.marketId,
          outcome: 'YES',
          side: 'BUY',
          sizeShares: 5,
        }),
      }),
      env,
    );
    expect(abortedOrder.status).toBe(500);
    rawDb.exec(`DROP TRIGGER fail_ledger_once;`);

    const sharesAfterAbort = (
      rawDb.prepare('SELECT shares_micro FROM beta_positions WHERE tenant_id = ?').get(tenantId) as { shares_micro: number }
    ).shares_micro;
    const ordersAfterAbort = (
      rawDb.prepare('SELECT COUNT(*) AS c FROM beta_orders WHERE tenant_id = ?').get(tenantId) as { c: number }
    ).c;
    expect(sharesAfterAbort).toBe(sharesBeforeAbort);
    expect(ordersAfterAbort).toBe(ordersBeforeAbort);

    // 7. Valid user settlement drill tags ledger note with [SIMULATED_DRILL]
    const okSettle = await worker.fetch(
      new Request('https://poly-beta-api.workers.dev/api/beta/positions/settle', {
        method: 'POST',
        headers: hdrs,
        body: JSON.stringify({ marketId: snap.marketId, winningOutcome: 'YES' }),
      }),
      env,
    );
    expect(okSettle.status).toBe(200);
    const settleJson = (await okSettle.json()) as { settlementSource: string; settledCount: number };
    expect(settleJson.settlementSource).toBe('USER_DRILL');
    expect(settleJson.settledCount).toBe(1);

    const settleLedger = rawDb
      .prepare("SELECT note FROM beta_ledger_entries WHERE tenant_id = ? AND entry_type = 'SETTLEMENT_PAYOUT'")
      .get(tenantId) as { note: string };
    expect(settleLedger.note).toContain('[SIMULATED_DRILL]');
  });
});
