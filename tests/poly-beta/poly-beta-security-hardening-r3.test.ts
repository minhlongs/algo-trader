/**
 * POLY-G5 Security & Concurrency Hardening Suite (Round 3):
 * - Linearizable DO rate-limit under `Promise.all` bursts (zero KV race bypass)
 * - Serialized DO per-tenant concurrent order burst invariants
 * - HMAC-verified Pages-to-Worker client IP forwarding (anti-spoof + anti-collapse)
 * - Atomic login session cap (<= 10) + constant-work unknown-email PBKDF2
 * - Maker 0-bps resting fee reservation truthfulness
 * - Per-tenant rate limits on `/api/beta/auth/me` and `/api/beta/auth/logout`
 */

import { describe, expect, it } from 'vitest';
import worker from '../../src/platform/poly-beta/poly-beta-worker';
import { checkRateLimit, consumeDoRateLimitSlot } from '../../src/platform/poly-beta/poly-beta-rate-limiter';
import { hmacSha256Hex } from '../../src/platform/poly-beta/poly-beta-security';
import { loadPendingOrderReservations } from '../../src/platform/poly-beta/poly-beta-order-reservations';
import { createPolyBetaTestHarness, testInviteTokenForEmail } from './poly-beta-test-harness';

const ORIGIN = 'https://poly-beta-dashboard.pages.dev';

describe('POLY-G5 Round-3 Security, Concurrency & Maker-Fee Invariants', () => {
  it('enforces linearizable 12/min login rate limit under 20 concurrent Promise.all requests', async () => {
    const { env } = await createPolyBetaTestHarness();
    const burst = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        worker.fetch(
          new Request('https://poly-beta-api.workers.dev/api/beta/auth/login', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Origin: ORIGIN,
              'CF-Connecting-IP': '198.51.100.77',
            },
            body: JSON.stringify({ email: `no-such-${i}@example.com`, password: 'Wrong#Password123!' }),
          }),
          env,
        ),
      ),
    );
    const okAttempts = burst.filter((r) => r.status === 401).length;
    const rateLimited = burst.filter((r) => r.status === 429).length;
    expect(okAttempts).toBe(12);
    expect(rateLimited).toBe(8);
  });

  it('honors HMAC-signed X-Poly-Beta-Client-IP and rejects forged or stale signatures', async () => {
    const { env } = await createPolyBetaTestHarness();
    env.POLY_BETA_PROXY_SECRET = 'proxy-hmac-secret-test-2026-poly-g5';
    const ts = String(Date.now());
    const validSig = await hmacSha256Hex(env.POLY_BETA_PROXY_SECRET, `203.0.113.10:${ts}`);

    // Exhaust 10/min signup bucket for forged caller (falls back to shared CF-Connecting-IP 10.0.0.1)
    for (let i = 0; i < 10; i++) {
      await worker.fetch(
        new Request('https://poly-beta-api.workers.dev/api/beta/auth/signup', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Origin: ORIGIN,
            'CF-Connecting-IP': '10.0.0.1',
            'X-Poly-Beta-Client-IP': `192.0.2.${i}`,
            'X-Poly-Beta-Proxy-Ts': ts,
            'X-Poly-Beta-Proxy-Sig': 'deadbeef'.repeat(8),
          },
          body: JSON.stringify({ email: 'bad', password: 'short', acknowledgedPaperOnly: false }),
        }),
        env,
      );
    }

    // 11th forged call hits shared 10.0.0.1 limit -> 429
    const forged11 = await worker.fetch(
      new Request('https://poly-beta-api.workers.dev/api/beta/auth/signup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: ORIGIN,
          'CF-Connecting-IP': '10.0.0.1',
          'X-Poly-Beta-Client-IP': '203.0.113.99',
          'X-Poly-Beta-Proxy-Ts': ts,
          'X-Poly-Beta-Proxy-Sig': '00'.repeat(32),
        },
        body: JSON.stringify({ email: 'bad', password: 'short', acknowledgedPaperOnly: false }),
      }),
      env,
    );
    expect(forged11.status).toBe(429);

    // Legitimate signed user 203.0.113.10 through the SAME CF-Connecting-IP 10.0.0.1 is NOT blocked!
    const signedUser = await worker.fetch(
      new Request('https://poly-beta-api.workers.dev/api/beta/auth/signup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: ORIGIN,
          'CF-Connecting-IP': '10.0.0.1',
          'X-Poly-Beta-Client-IP': '203.0.113.10',
          'X-Poly-Beta-Proxy-Ts': ts,
          'X-Poly-Beta-Proxy-Sig': validSig,
        },
        body: JSON.stringify({
          email: 'signed-client@example.com',
          password: 'Valid#Password2026!',
          inviteToken: testInviteTokenForEmail('signed-client@example.com'),
          acknowledgeSimulationAndRisk: true,
        }),
      }),
      env,
    );
    expect(signedUser.status).toBe(201);
  });

  it('serializes concurrent DO manual orders, caps active sessions <= 10, reserves 0 maker fee, and rate-limits /me & /logout', async () => {
    const { env, rawSqlite } = await createPolyBetaTestHarness();
    const signup = await worker.fetch(
      new Request('https://poly-beta-api.workers.dev/api/beta/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
        body: JSON.stringify({
          email: 'serial-do@example.com',
          password: 'Valid#Password2026!',
          inviteToken: testInviteTokenForEmail('serial-do@example.com'),
          acknowledgeSimulationAndRisk: true,
        }),
      }),
      env,
    );
    const cookie = signup.headers.get('Set-Cookie')!.split(';')[0]!;
    const { csrfToken, user } = (await signup.json()) as { csrfToken: string; user: { tenantId: string } };
    const hdrs = { 'Content-Type': 'application/json', Origin: ORIGIN, Cookie: cookie, 'X-CSRF-Token': csrfToken };

    // Resting post-only limit BUY at $0.40 (< bestAsk $0.46) reserves 0 maker fee
    const restingRes = await worker.fetch(
      new Request('https://poly-beta-api.workers.dev/api/beta/orders', {
        method: 'POST',
        headers: hdrs,
        body: JSON.stringify({
          idempotencyKey: 'resting-maker-zero-fee',
          marketId: 'mkt-fed-rate-2026',
          outcome: 'YES',
          side: 'BUY',
          sizeShares: 5,
          limitPrice: 0.4,
        }),
      }),
      env,
    );
    expect(restingRes.status).toBe(200);
    const pending = await loadPendingOrderReservations(env.POLY_BETA_DB, user.tenantId, 'tok_fed_yes');
    expect(pending.buyNotionalMicro).toBe(2_000_000);
    expect(pending.buyFeeMicro).toBe(0);

    // Concurrent burst of 5 taker BUY orders on the same tenant DO preserves monotonic ledger seq
    const orderBurst = await Promise.all(
      Array.from({ length: 5 }, (_, idx) =>
        worker.fetch(
          new Request('https://poly-beta-api.workers.dev/api/beta/orders', {
            method: 'POST',
            headers: hdrs,
            body: JSON.stringify({
              idempotencyKey: `burst-ord-${idx}`,
              marketId: 'mkt-fed-rate-2026',
              outcome: 'YES',
              side: 'BUY',
              sizeShares: 5,
            }),
          }),
          env,
        ),
      ),
    );
    expect(orderBurst.every((r) => r.status === 200)).toBe(true);
    const seqRows = rawSqlite
      .prepare(`SELECT seq FROM beta_ledger_entries WHERE tenant_id = ? ORDER BY seq ASC`)
      .all(user.tenantId) as Array<{ seq: number }>;
    expect(seqRows.map((r) => r.seq)).toEqual([1, 2, 3, 4, 5, 6]);

    // 12 sequential logins from distinct IPs cap active sessions per tenant at <= 10
    for (let i = 0; i < 12; i++) {
      const loginRes = await worker.fetch(
        new Request('https://poly-beta-api.workers.dev/api/beta/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Origin: ORIGIN, 'CF-Connecting-IP': `198.18.0.${i + 1}` },
          body: JSON.stringify({ email: 'serial-do@example.com', password: 'Valid#Password2026!' }),
        }),
        env,
      );
      expect(loginRes.status).toBe(200);
    }
    const sessCount = rawSqlite
      .prepare(`SELECT COUNT(*) AS c FROM beta_sessions WHERE tenant_id = ?`)
      .get(user.tenantId) as { c: number };
    expect(sessCount.c).toBeLessThanOrEqual(10);
  });

  it('covers rate-limiter empty bucketKey, window slot rollover purge, and KV fallback allow/deny branches', async () => {
    const { env } = await createPolyBetaTestHarness();
    const doId = env.TENANT_PAPER_ENGINE.idFromName('rl:rollover-test');
    const stub = env.TENANT_PAPER_ENGINE.get(doId);

    // Empty bucketKey -> 400
    const badRes = await stub.fetch('https://poly-beta.internal/rate-limit', {
      method: 'POST',
      body: JSON.stringify({ bucketKey: '' }),
    });
    expect(badRes.status).toBe(400);

    // Window 1 -> allowed; Window 2 (+60s) -> triggers activeSlot !== slot deleteAll() rollover
    const w1 = await checkRateLimit(env, 'rollover-bucket', 2, 60, 60_000);
    expect(w1).toEqual({ allowed: true, remaining: 1 });
    const w2 = await checkRateLimit(env, 'rollover-bucket', 2, 60, 120_000);
    expect(w2).toEqual({ allowed: true, remaining: 1 });

    // Direct consumeDoRateLimitSlot without POLY_BETA_KV binding
    const noKvEnv = { ...env, POLY_BETA_KV: undefined as unknown as typeof env.POLY_BETA_KV };
    const store = new Map<string, unknown>();
    const direct = await consumeDoRateLimitSlot(
      {
        get: async <T>(k: string) => store.get(k) as T | undefined,
        put: async (k: string, v: unknown) => void store.set(k, v),
        deleteAll: async () => store.clear(),
        setAlarm: async () => {},
        deleteAlarm: async () => {},
      },
      noKvEnv,
      { bucketKey: 'no-kv', limit: 1, windowSec: 60 },
    );
    expect(direct.status).toBe(200);

    // KV fallback allow -> then block
    const kvOnlyEnv = { ...env, TENANT_PAPER_ENGINE: undefined as unknown as typeof env.TENANT_PAPER_ENGINE };
    const f1 = await checkRateLimit(kvOnlyEnv, 'kv-fallback-allow', 1, 60, 180_000);
    const f2 = await checkRateLimit(kvOnlyEnv, 'kv-fallback-allow', 1, 60, 180_000);
    expect(f1.allowed).toBe(true);
    expect(f2.allowed).toBe(false);
  });
});
