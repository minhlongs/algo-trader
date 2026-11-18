import { describe, expect, it } from 'vitest';
import worker from '../../src/platform/poly-beta/poly-beta-worker';
import { TenantPaperEngine } from '../../src/platform/poly-beta/tenant-paper-engine-do';
import {
  isMutationSourcePermitted,
  readMarketNegativeCache,
  resolveClientIpKey,
  writeMarketNegativeCache,
} from '../../src/platform/poly-beta/poly-beta-request-guards';
import { SESSION_COOKIE_NAME } from '../../src/platform/poly-beta/poly-beta-types';
import {
  createMemoryDoStorage,
  createPolyBetaTestHarness,
} from './poly-beta-test-harness';

const ORIGIN = 'https://poly-beta-dashboard.pages.dev';
const SIGNUP_BODY = JSON.stringify({
  email: 'guard@example.com',
  password: 'GuardPassword!123',
  acknowledgeSimulationAndRisk: true,
});

describe('POLY-G5 Request Guards, Cookie Prefix, Error Boundaries & Negative Cache', () => {
  it('enforces the __Host- cookie prefix and rejects spoofed mutation sources in public-beta', async () => {
    const { env } = await createPolyBetaTestHarness();
    const prodEnv = { ...env, ENVIRONMENT: 'public-beta' };

    expect(SESSION_COOKIE_NAME).toBe('__Host-poly_beta_sid');

    const noOrigin = await worker.fetch(
      new Request('https://poly-beta-api.workers.dev/api/beta/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: SIGNUP_BODY,
      }),
      prodEnv,
    );
    expect(noOrigin.status).toBe(403);

    const crossSite = await worker.fetch(
      new Request('https://poly-beta-api.workers.dev/api/beta/auth/signup', {
        method: 'POST',
        headers: {
          Origin: ORIGIN,
          'Sec-Fetch-Site': 'cross-site',
          'Content-Type': 'application/json',
        },
        body: SIGNUP_BODY,
      }),
      prodEnv,
    );
    expect(crossSite.status).toBe(403);

    const sameOrigin = new Request('https://poly-beta-api.workers.dev/api/beta/auth/signup', {
      headers: { Origin: ORIGIN, 'Sec-Fetch-Site': 'same-origin' },
    });
    expect(isMutationSourcePermitted(sameOrigin, prodEnv)).toBe(true);
    expect(isMutationSourcePermitted(sameOrigin, env)).toBe(true);
  });

  it('ignores X-Forwarded-For for rate-limit buckets in public-beta', async () => {
    const { env } = await createPolyBetaTestHarness();
    const prodEnv = { ...env, ENVIRONMENT: 'public-beta' };

    const spoofed = new Request('https://poly-beta-api.workers.dev/api/beta/auth/login', {
      headers: { 'X-Forwarded-For': '198.51.100.99' },
    });
    expect(resolveClientIpKey(spoofed, prodEnv)).toBe('edge-no-cf-ip');

    const cfIp = new Request('https://poly-beta-api.workers.dev/api/beta/auth/login', {
      headers: { 'CF-Connecting-IP': '203.0.113.7', 'X-Forwarded-For': '198.51.100.99' },
    });
    expect(resolveClientIpKey(cfIp, prodEnv)).toBe('203.0.113.7');
    expect(resolveClientIpKey(spoofed, env)).toBe('198.51.100.99');
  });

  it('prunes expired sessions on login and honours the negative market cache backoff', async () => {
    const { env, rawSqlite } = await createPolyBetaTestHarness();

    const signup = await worker.fetch(
      new Request('https://poly-beta-api.workers.dev/api/beta/auth/signup', {
        method: 'POST',
        headers: { Origin: ORIGIN, 'Content-Type': 'application/json' },
        body: SIGNUP_BODY,
      }),
      env,
    );
    expect(signup.status).toBe(201);
    expect((signup.headers.get('Set-Cookie') ?? '').startsWith('__Host-poly_beta_sid=')).toBe(true);

    rawSqlite.prepare(`UPDATE beta_sessions SET expires_at_ms = 1`).run();
    const login = await worker.fetch(
      new Request('https://poly-beta-api.workers.dev/api/beta/auth/login', {
        method: 'POST',
        headers: { Origin: ORIGIN, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'guard@example.com', password: 'GuardPassword!123' }),
      }),
      env,
    );
    expect(login.status).toBe(200);
    const counted = rawSqlite.prepare(`SELECT COUNT(*) AS c FROM beta_sessions`).get() as {
      c: number;
    };
    expect(counted.c).toBe(1);

    await writeMarketNegativeCache(env, 'Upstream market fetch failed', 1_000_000);
    expect(await readMarketNegativeCache(env, 1_005_000)).toBe('Upstream market fetch failed');
    expect(await readMarketNegativeCache(env, 1_020_000)).toBeNull();
  });

  it('returns sanitized 500 JSON from the Worker and the DO instead of leaking internals', async () => {
    const { env } = await createPolyBetaTestHarness();
    const brokenEnv = {
      ...env,
      POLY_BETA_KV: {
        ...env.POLY_BETA_KV,
        async get(): Promise<string | null> {
          throw new Error('SECRET_INTERNAL_KV_TOKEN_XYZ');
        },
      },
    };
    const res = await worker.fetch(
      new Request('https://poly-beta-api.workers.dev/api/beta/markets'),
      brokenEnv,
    );
    expect(res.status).toBe(500);
    expect(await res.text()).not.toContain('SECRET_INTERNAL_KV_TOKEN_XYZ');

    const brokenStorage = {
      ...createMemoryDoStorage(),
      async deleteAll(): Promise<void> {
        throw new Error('DO_STORAGE_SECRET_ERR');
      },
    };
    const brokenDo = new TenantPaperEngine({ storage: brokenStorage }, env);
    const doRes = await brokenDo.fetch(
      new Request('https://poly-beta.internal/purge', {
        method: 'POST',
        body: JSON.stringify({ tenantId: 'ten_1' }),
      }),
    );
    expect(doRes.status).toBe(500);
    expect(await doRes.text()).not.toContain('DO_STORAGE_SECRET_ERR');
  });
});
