import { describe, expect, it } from 'vitest';
import worker from '../../src/platform/poly-beta/poly-beta-worker';
import type { PolyBetaEnv } from '../../src/platform/poly-beta/poly-beta-types';
import { createPolyBetaTestHarness, testInviteTokenForEmail } from './poly-beta-test-harness';

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

describe('In-app feedback API, isolation, rate limit, and account deletion purge', () => {
  it('creates and lists feedback scoped per tenant, rejects XSS/authority override, enforces rate limit, and purges on account delete', async () => {
    const { env, rawSqlite } = await createPolyBetaTestHarness();
    try {
      const alice = await signupTenant(env, 'alice@example.com');
      const bob = await signupTenant(env, 'bob@example.com');

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

      const xssRes = await worker.fetch(
        new Request(`${ORIGIN}/api/beta/feedback`, {
          method: 'POST',
          headers: alice.headers,
          body: JSON.stringify({ category: 'bug', message: 'Broken chart <script>alert(1)</script>' }),
        }),
        env,
      );
      expect(xssRes.status).toBe(400);
      expect(await xssRes.json()).toMatchObject({ code: 'INVALID_FEEDBACK_CONTENT' });

      const overrideRes = await worker.fetch(
        new Request(`${ORIGIN}/api/beta/feedback`, {
          method: 'POST',
          headers: alice.headers,
          body: JSON.stringify({ category: 'other', message: 'Attempting tenant override', tenantId: bob.tenantId }),
        }),
        env,
      );
      expect(overrideRes.status).toBe(403);
      expect(await overrideRes.json()).toMatchObject({ code: 'CALLER_SCOPE_FORBIDDEN' });

      const bobList = await worker.fetch(
        new Request(`${ORIGIN}/api/beta/feedback`, { method: 'GET', headers: { Origin: ORIGIN, Cookie: bob.cookie } }),
        env,
      );
      expect(bobList.status).toBe(200);
      expect(await bobList.json()).toMatchObject({ ok: true, feedback: [] });

      const aliceList = await worker.fetch(
        new Request(`${ORIGIN}/api/beta/feedback`, { method: 'GET', headers: { Origin: ORIGIN, Cookie: alice.cookie } }),
        env,
      );
      expect(aliceList.status).toBe(200);
      const aliceItems = (await aliceList.json()) as { feedback: Array<{ feedbackId: string }> };
      expect(aliceItems.feedback).toHaveLength(1);
      expect(aliceItems.feedback[0]!.feedbackId).toBe(createdBody.feedback.feedbackId);

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

      const delRes = await worker.fetch(
        new Request(`${ORIGIN}/api/beta/account`, { method: 'DELETE', headers: alice.headers }),
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
});
