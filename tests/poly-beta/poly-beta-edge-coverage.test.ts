import { describe, expect, it } from 'vitest';
import worker from '../../src/platform/poly-beta/poly-beta-worker';
import { executeSerializedPaperOrder } from '../../src/platform/poly-beta/poly-beta-execution';
import { fetchSupportedBetaMarkets } from '../../src/platform/poly-beta/poly-beta-markets';
import { refreshMarksAndDrawdown } from '../../src/platform/poly-beta/poly-beta-ledger';
import {
  buildSessionClearCookie,
  buildSessionSetCookie,
  extractSessionTokenFromCookie,
  timingSafeHexEqual,
  verifyUserPassword,
} from '../../src/platform/poly-beta/poly-beta-security';
import { createPolyBetaTestHarness, seedMarketSnapshots, testInviteTokenForEmail } from './poly-beta-test-harness';

const ORIGIN = 'https://poly-beta-dashboard.pages.dev';

describe('POLY-G5 Public Beta — Branch & Edge-Case Coverage', () => {
  it('covers CORS preflight, preview subdomains, HTTP dev cookies, health, markets, me, logout, and validation/origin/expiry errors', async () => {
    const { env } = await createPolyBetaTestHarness();

    const optOk = await worker.fetch(
      new Request('https://poly-beta-api.workers.dev/api/beta/portfolio', {
        method: 'OPTIONS',
        headers: { Origin: 'https://preview-123.poly-beta-dashboard.pages.dev' },
      }),
      env,
    );
    expect(optOk.status).toBe(204);

    const optBad = await worker.fetch(
      new Request('https://poly-beta-api.workers.dev/api/beta/portfolio', {
        method: 'OPTIONS',
        headers: { Origin: 'https://malicious.site' },
      }),
      env,
    );
    expect(optBad.status).toBe(403);

    expect((await worker.fetch(new Request('https://poly-beta-api.workers.dev/api/health'), env)).status).toBe(200);
    expect((await worker.fetch(new Request('https://poly-beta-api.workers.dev/health'), env)).status).toBe(200);
    expect((await worker.fetch(new Request('https://poly-beta-api.workers.dev/api/beta/markets'), env)).status).toBe(200);

    expect(buildSessionSetCookie('a'.repeat(64), false)).toContain('SameSite=Lax');
    expect(buildSessionClearCookie(false)).toContain('Max-Age=0');
    expect(extractSessionTokenFromCookie(null, true)).toBeNull();
    expect(extractSessionTokenFromCookie('malformed; short=abc', false)).toBeNull();
    expect(extractSessionTokenFromCookie(`poly_beta_sid=${'a'.repeat(64)}`, true)).toBeNull();
    expect(extractSessionTokenFromCookie(`poly_beta_sid=${'a'.repeat(64)}`, false)).toBe('a'.repeat(64));
    expect(extractSessionTokenFromCookie(`__Host-poly_beta_sid=${'b'.repeat(64)}`, true)).toBe('b'.repeat(64));
    expect(timingSafeHexEqual('', '')).toBe(false);
    expect(await verifyUserPassword('pw', 'abcd', 'bad')).toBe(false);
    expect(await verifyUserPassword('pw', 'abcd', '00'.repeat(16))).toBe(false);

    // Bad origin on signup & login
    expect(
      (await worker.fetch(new Request('https://poly-beta-api.workers.dev/api/beta/auth/signup', { method: 'POST', headers: { Origin: 'https://evil.site' } }), env)).status,
    ).toBe(403);
    expect(
      (await worker.fetch(new Request('https://poly-beta-api.workers.dev/api/beta/auth/login', { method: 'POST', headers: { Origin: 'https://evil.site' } }), env)).status,
    ).toBe(403);

    // Invalid JSON & validation errors on signup/login
    expect(
      (await worker.fetch(new Request('http://localhost:8787/api/beta/auth/signup', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:5173' }, body: '{bad' }), env)).status,
    ).toBe(400);
    expect(
      (await worker.fetch(new Request('http://localhost:8787/api/beta/auth/signup', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:5173' }, body: JSON.stringify({ email: 'bad', password: 'short' }) }), env)).status,
    ).toBe(400);
    expect(
      (await worker.fetch(new Request('http://localhost:8787/api/beta/auth/signup', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:5173' }, body: JSON.stringify({ email: 'a@b.com', password: 'Strong#BetaPassword2026!', acknowledgeSimulationAndRisk: true, seedPhrase: 'forbidden' }) }), env)).status,
    ).toBe(403);
    expect(
      (await worker.fetch(new Request('http://localhost:8787/api/beta/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:5173' }, body: '{bad' }), env)).status,
    ).toBe(400);
    expect(
      (await worker.fetch(new Request('http://localhost:8787/api/beta/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:5173' }, body: JSON.stringify({ email: 'not-an-email', password: '' }) }), env)).status,
    ).toBe(401);

    // Valid signup + duplicate 409 + login + /me + expired session cleanup + logout + unknown subroute
    const s1 = await worker.fetch(
      new Request('http://localhost:8787/api/beta/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:5173' },
        body: JSON.stringify({ email: 'dev@example.com', password: 'Strong#BetaPassword2026!', inviteToken: testInviteTokenForEmail('dev@example.com'), acknowledgeSimulationAndRisk: true }),
      }),
      env,
    );
    expect(s1.status).toBe(201);
    const dup = await worker.fetch(
      new Request('http://localhost:8787/api/beta/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:5173' },
        body: JSON.stringify({ email: 'dev@example.com', password: 'Strong#BetaPassword2026!', inviteToken: testInviteTokenForEmail('dev@example.com', 'second'), acknowledgeSimulationAndRisk: true }),
      }),
      env,
    );
    expect(dup.status).toBe(409);

    const loginRes = await worker.fetch(
      new Request('http://localhost:8787/api/beta/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:5173' },
        body: JSON.stringify({ email: 'dev@example.com', password: 'Strong#BetaPassword2026!' }),
      }),
      env,
    );
    const cookie = loginRes.headers.get('Set-Cookie')!.split(';')[0]!;
    const { csrfToken } = (await loginRes.json()) as { csrfToken: string };

    expect((await worker.fetch(new Request('http://localhost:8787/api/beta/auth/me', { headers: { Cookie: cookie } }), env)).status).toBe(200);
    expect((await worker.fetch(new Request('http://localhost:8787/api/beta/unknown-sub', { headers: { Cookie: cookie } }), env)).status).toBe(404);

    // Mutation validation error paths (control, orders, settle) + cancel own order + STEP action
    const hdrs = { 'Content-Type': 'application/json', Origin: 'http://localhost:5173', Cookie: cookie, 'X-CSRF-Token': csrfToken };
    expect((await worker.fetch(new Request('http://localhost:8787/api/beta/strategy/control', { method: 'POST', headers: hdrs, body: JSON.stringify({ action: 'INVALID' }) }), env)).status).toBe(400);
    expect((await worker.fetch(new Request('http://localhost:8787/api/beta/orders', { method: 'POST', headers: hdrs, body: JSON.stringify({ sizeShares: 1 }) }), env)).status).toBe(400);
    expect((await worker.fetch(new Request('http://localhost:8787/api/beta/orders', { method: 'POST', headers: hdrs, body: JSON.stringify({ idempotencyKey: 'valid-key-123', marketId: 'm1', outcome: 'YES', side: 'BUY', sizeShares: 5, walletAddress: '0x1' }) }), env)).status).toBe(403);
    expect((await worker.fetch(new Request('http://localhost:8787/api/beta/positions/settle', { method: 'POST', headers: hdrs, body: JSON.stringify({ marketId: '' }) }), env)).status).toBe(400);
    expect((await worker.fetch(new Request('http://localhost:8787/api/beta/positions/settle', { method: 'POST', headers: hdrs, body: JSON.stringify({ marketId: 'm1', winningOutcome: 'YES', tenantId: 'tn_bad' }) }), env)).status).toBe(403);
    expect((await worker.fetch(new Request('http://localhost:8787/api/beta/strategy/control', { method: 'POST', headers: hdrs, body: JSON.stringify({ action: 'STEP' }) }), env)).status).toBe(200);

    // Resting order + cancel own order
    const restRes = await worker.fetch(
      new Request('http://localhost:8787/api/beta/orders', {
        method: 'POST',
        headers: hdrs,
        body: JSON.stringify({ idempotencyKey: 'rest-cancel-own', marketId: 'mkt-fed-rate-2026', outcome: 'YES', side: 'BUY', sizeShares: 5, limitPrice: 0.2 }),
      }),
      env,
    );
    const { orderId } = (await restRes.json()) as { orderId: string };
    expect((await worker.fetch(new Request(`http://localhost:8787/api/beta/orders/${orderId}/cancel`, { method: 'POST', headers: hdrs }), env)).status).toBe(200);

    // Stop engine, hit logout explicitly, and confirm expired session cleanup on a second login
    expect((await worker.fetch(new Request('http://localhost:8787/api/beta/strategy/control', { method: 'POST', headers: hdrs, body: JSON.stringify({ action: 'STOP' }) }), env)).status).toBe(200);
    expect((await worker.fetch(new Request('http://localhost:8787/api/beta/auth/logout', { method: 'POST', headers: hdrs }), env)).status).toBe(200);

    const login2 = await worker.fetch(
      new Request('http://localhost:8787/api/beta/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:5173' },
        body: JSON.stringify({ email: 'dev@example.com', password: 'Strong#BetaPassword2026!' }),
      }),
      env,
    );
    const cookie2 = login2.headers.get('Set-Cookie')!.split(';')[0]!;
    await env.POLY_BETA_DB.prepare(`UPDATE beta_sessions SET expires_at_ms = 1`).bind().run();
    expect((await worker.fetch(new Request('http://localhost:8787/api/beta/auth/me', { headers: { Cookie: cookie2 } }), env)).status).toBe(401);
  });

  it('covers execution risk blocks, market feed failure modes, DO unhealthy feed halt, NO outcome pricing, and missing portfolio error', async () => {
    const { env, kv, engines } = await createPolyBetaTestHarness();
    await expect(refreshMarksAndDrawdown(env.POLY_BETA_DB, 'tn_nonexistent', new Map(), Date.now())).rejects.toThrow(/Portfolio missing/);

    // Upstream feed HTTP 500, empty array, and network throw
    await kv.put('markets:public:v1', '{corrupt-json');
    const http500 = await fetchSupportedBetaMarkets(env, { fetchImpl: async () => new Response('err', { status: 500 }) });
    expect(http500.feedHealthy).toBe(false);
    await kv.delete('markets:public:v1');
    const emptyFeed = await fetchSupportedBetaMarkets(env, { fetchImpl: async () => new Response('[]', { status: 200 }) });
    expect(emptyFeed.feedHealthy).toBe(false);
    const netThrow = await fetchSupportedBetaMarkets(env, { fetchImpl: async () => { throw new Error('dns-fail'); } });
    expect(netThrow.feedHealthy).toBe(false);
    const nowForArr = Date.now();
    const arrayFields = await fetchSupportedBetaMarkets(env, {
      nowMs: nowForArr,
      fetchImpl: async () =>
        new Response(
          JSON.stringify([
            {
              id: 'arr-mkt',
              question: 'Array token market?',
              clobTokenIds: ['111', '222'],
              outcomePrices: ['bad-json'],
              bestBid: 0.44,
              bestAsk: 0.48,
              updatedAt: new Date(nowForArr - 2_000).toISOString(),
              active: true,
            },
          ]),
          { status: 200 },
        ),
    });
    expect(arrayFields.feedHealthy).toBe(true);

    await kv.put('markets:public:v1', JSON.stringify(seedMarketSnapshots()));
    const s = await worker.fetch(
      new Request('https://poly-beta-api.workers.dev/api/beta/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
        body: JSON.stringify({ email: 'risk@example.com', password: 'Strong#BetaPassword2026!', inviteToken: testInviteTokenForEmail('risk@example.com'), acknowledgeSimulationAndRisk: true }),
      }),
      env,
    );
    const cookie = s.headers.get('Set-Cookie')!.split(';')[0]!;
    const { csrfToken, user } = (await s.json()) as { csrfToken: string; user: { tenantId: string } };
    const snap = seedMarketSnapshots()[0]!;

    // Resting order over $5 cap -> rejected
    const restOver = await executeSerializedPaperOrder(env.POLY_BETA_DB, {
      tenantId: user.tenantId, idempotencyKey: 'rest-over-5', strategyId: 'toxicity-aware-mm-paper',
      market: snap, outcome: 'YES', side: 'BUY', sizeShares: 20, limitPrice: 0.3, nowMs: Date.now(),
    });
    expect(restOver.ok).toBe(false);

    // Stale snapshot directly in executeSerializedPaperOrder -> STALE_MARKET_DATA + HALTED, then subsequent order -> ENGINE_HALTED
    const directStale = await executeSerializedPaperOrder(env.POLY_BETA_DB, {
      tenantId: user.tenantId, idempotencyKey: 'direct-stale', strategyId: 'toxicity-aware-mm-paper',
      market: { ...snap, sourceTimestampMs: Date.now() - 90_000 }, outcome: 'NO', side: 'BUY', sizeShares: 5, nowMs: Date.now(),
    });
    expect(directStale).toEqual({ ok: false, code: 'STALE_MARKET_DATA', detail: expect.any(String) });

    const whileHalted = await executeSerializedPaperOrder(env.POLY_BETA_DB, {
      tenantId: user.tenantId, idempotencyKey: 'while-halted', strategyId: 'toxicity-aware-mm-paper',
      market: snap, outcome: 'NO', side: 'BUY', sizeShares: 5, nowMs: Date.now(),
    });
    expect(whileHalted).toEqual({ ok: false, code: 'ENGINE_HALTED', detail: expect.any(String) });

    // Unhalt via START, buy NO outcome shares, settle winningOutcome='NO', then test ticksRemaining=0 & drawdown auto-halt
    const hdrs = { 'Content-Type': 'application/json', Origin: ORIGIN, Cookie: cookie, 'X-CSRF-Token': csrfToken };
    await worker.fetch(new Request('https://poly-beta-api.workers.dev/api/beta/strategy/control', { method: 'POST', headers: hdrs, body: JSON.stringify({ action: 'START' }) }), env);
    const buyNo = await executeSerializedPaperOrder(env.POLY_BETA_DB, {
      tenantId: user.tenantId, idempotencyKey: 'buy-no-1', strategyId: 'toxicity-aware-mm-paper',
      market: snap, outcome: 'NO', side: 'BUY', sizeShares: 5, nowMs: Date.now(),
    });
    expect(buyNo.ok).toBe(true);
    await worker.fetch(new Request('https://poly-beta-api.workers.dev/api/beta/positions/settle', { method: 'POST', headers: hdrs, body: JSON.stringify({ marketId: snap.marketId, winningOutcome: 'NO' }) }), env);

    // Exhaust ticksRemaining=0 branch on DO alarm
    const doInst = engines.get(user.tenantId)!.instance;
    await engines.get(user.tenantId)!.storage.put('ticksRemaining', 0);
    await doInst.alarm();

    // Open 3 x 10 YES shares ($13.80) and crash mark to $0.02 -> auto-halt on >5% drawdown
    for (let i = 1; i <= 3; i++) {
      await executeSerializedPaperOrder(env.POLY_BETA_DB, {
        tenantId: user.tenantId, idempotencyKey: `dd-${i}`, strategyId: 'toxicity-aware-mm-paper',
        market: snap, outcome: 'YES', side: 'BUY', sizeShares: 10, nowMs: Date.now(),
      });
    }
    await kv.put('markets:public:v1', JSON.stringify([{ ...snap, bestBid: 0.02, bestAsk: 0.04 }]));
    const ddView = await (await worker.fetch(new Request('https://poly-beta-api.workers.dev/api/beta/portfolio', { headers: { Origin: ORIGIN, Cookie: cookie } }), env)).json() as { engine: { state: string } };
    expect(ddView.engine.state).toBe('HALTED');

    // DO internal missing-tenantId 400 & unknown-route 404 & unhealthy feed during alarm
    await worker.fetch(new Request('https://poly-beta-api.workers.dev/api/beta/strategy/control', { method: 'POST', headers: hdrs, body: JSON.stringify({ action: 'START' }) }), env);
    expect((await doInst.fetch(new Request('https://poly-beta.internal/control', { method: 'POST', body: '{}' }))).status).toBe(400);
    expect((await doInst.fetch(new Request('https://poly-beta.internal/bad', { method: 'POST', body: JSON.stringify({ tenantId: user.tenantId }) }))).status).toBe(404);

    // Simulate feed failure during DO alarm tick -> halts engine and clears alarm
    await kv.delete('markets:public:v1');
    env.POLYMARKET_PUBLIC_GAMMA_URL = 'http://127.0.0.1:1';
    await engines.get(user.tenantId)!.storage.put('ticksRemaining', 5);
    await doInst.alarm();
    expect(engines.get(user.tenantId)!.storage.getScheduledAlarm()).toBeNull();
  });
});
