import { describe, expect, it } from 'vitest';
import { handleBetaLogin, handleBetaSignup } from '../../src/platform/poly-beta/poly-beta-auth';
import type { PolyBetaEnv } from '../../src/platform/poly-beta/poly-beta-types';
import { createPolyBetaTestHarness } from './poly-beta-test-harness';

const ORIGIN = 'https://poly-beta-dashboard.pages.dev';
const API = 'https://poly-beta-api.workers.dev';

function signupRequest(body: string, url = `${API}/api/beta/auth/signup`, origin = ORIGIN): Request {
  return new Request(url, {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json' },
    body,
  });
}

const VALID_BODY = JSON.stringify({
  email: 'branch@example.com',
  password: 'BranchPassword!123',
  acknowledgeSimulationAndRisk: true,
});

describe('poly-beta auth branch coverage', () => {
  it('rejects origin, over-long payloads, malformed JSON and schema violations on signup', async () => {
    const { env } = await createPolyBetaTestHarness();

    const badOrigin = await handleBetaSignup(signupRequest(VALID_BODY, `${API}/api/beta/auth/signup`, 'https://evil.example'), env);
    expect(badOrigin.status).toBe(403);

    const huge = await handleBetaSignup(signupRequest(JSON.stringify({ pad: 'x'.repeat(70_000) })), env);
    expect([400, 413]).toContain(huge.status);

    const malformed = await handleBetaSignup(signupRequest('{not json'), env);
    expect(malformed.status).toBe(400);

    const badSchema = await handleBetaSignup(
      signupRequest(JSON.stringify({ email: 'nope', password: 'short', acknowledgeSimulationAndRisk: false })),
      env,
    );
    expect(badSchema.status).toBe(400);
    expect((await badSchema.json<{ code: string }>()).code).toBe('VALIDATION_ERROR');

    const override = await handleBetaSignup(
      signupRequest(VALID_BODY, `${API}/api/beta/auth/signup?tenantId=tn_evil`),
      env,
    );
    expect(override.status).toBe(403);
    expect((await override.json<{ code: string }>()).code).toBe('CALLER_SCOPE_FORBIDDEN');
  });

  it('returns 409 for a duplicate email and maps UNIQUE constraint races to EMAIL_EXISTS', async () => {
    const { env } = await createPolyBetaTestHarness();

    const first = await handleBetaSignup(signupRequest(VALID_BODY), env);
    expect(first.status).toBe(201);

    const duplicate = await handleBetaSignup(signupRequest(VALID_BODY), env);
    expect(duplicate.status).toBe(409);
    expect((await duplicate.json<{ code: string }>()).code).toBe('EMAIL_EXISTS');

    const racingEnv: PolyBetaEnv = {
      ...env,
      POLY_BETA_DB: {
        prepare() {
          return {
            bind() {
              return this;
            },
            async first() {
              return null;
            },
            async run() {
              throw new Error('UNIQUE constraint failed: beta_users.email');
            },
            async all() {
              return { results: [] };
            },
          };
        },
        async batch() {
          throw new Error('UNIQUE constraint failed: beta_users.email');
        },
      } as unknown as PolyBetaEnv['POLY_BETA_DB'],
    };

    const race = await handleBetaSignup(signupRequest(VALID_BODY), racingEnv);
    expect(race.status).toBe(409);
    expect((await race.json<{ code: string }>()).code).toBe('EMAIL_EXISTS');
  });

  it('rate-limits and validates both signup and login, and rejects bad credentials', async () => {
    const { env } = await createPolyBetaTestHarness();
    const nowMs = 1_000_000;

    for (let i = 0; i < 10; i += 1) {
      const ok = await handleBetaSignup(signupRequest(VALID_BODY.replace('branch@', `branch${i}@`)), env, nowMs);
      expect(ok.status).toBe(201);
    }
    const limited = await handleBetaSignup(signupRequest(VALID_BODY.replace('branch@', 'branch99@')), env, nowMs);
    expect(limited.status).toBe(429);

    const loginUrl = `${API}/api/beta/auth/login`;
    const loginReq = (body: string, origin = ORIGIN) =>
      new Request(loginUrl, {
        method: 'POST',
        headers: { Origin: origin, 'Content-Type': 'application/json' },
        body,
      });

    const loginBadOrigin = await handleBetaLogin(loginReq(JSON.stringify({ email: 'x@y.io', password: 'x' }), 'https://nope.example'), env);
    expect(loginBadOrigin.status).toBe(403);

    const loginBadSchema = await handleBetaLogin(loginReq(JSON.stringify({ email: 'not-an-email' })), env);
    expect(loginBadSchema.status).toBe(401);
    expect((await loginBadSchema.json<{ code: string }>()).code).toBe('INVALID_CREDENTIALS');

    const loginMalformed = await handleBetaLogin(loginReq('{bad'), env);
    expect(loginMalformed.status).toBe(400);

    const loginUnknown = await handleBetaLogin(loginReq(JSON.stringify({ email: 'ghost@example.com', password: 'GhostPassword!123' })), env);
    expect(loginUnknown.status).toBe(401);

    const wrongPassword = await handleBetaLogin(loginReq(JSON.stringify({ email: 'branch0@example.com', password: 'WrongPassword!123' })), env);
    expect(wrongPassword.status).toBe(401);

    const loginOk = await handleBetaLogin(loginReq(JSON.stringify({ email: 'branch0@example.com', password: 'BranchPassword!123' })), env);
    expect(loginOk.status).toBe(200);
    expect((loginOk.headers.get('Set-Cookie') ?? '').startsWith('__Host-poly_beta_sid=')).toBe(true);

    for (let i = 0; i < 12; i += 1) {
      await handleBetaLogin(loginReq(JSON.stringify({ email: 'ghost@example.com', password: 'GhostPassword!123' })), env, nowMs);
    }
    const loginLimited = await handleBetaLogin(
      loginReq(JSON.stringify({ email: 'ghost@example.com', password: 'GhostPassword!123' })),
      env,
      nowMs,
    );
    expect(loginLimited.status).toBe(429);
  });

  it('issues non-Secure dev cookies on http and Secure __Host cookies on https', async () => {
    const { env } = await createPolyBetaTestHarness();
    const httpSignup = await handleBetaSignup(signupRequest(JSON.stringify({
      email: 'dev@example.com',
      password: 'DevPassword!12345',
      acknowledgeSimulationAndRisk: true,
    }), 'http://localhost:8787/api/beta/auth/signup', 'http://localhost:5173'), env);
    expect(httpSignup.status).toBe(201);
    const devCookie = httpSignup.headers.get('Set-Cookie') ?? '';
    expect(devCookie).toContain('poly_beta_sid=');
    expect(devCookie).not.toContain('__Host-');

    const httpsSignup = await handleBetaSignup(signupRequest(JSON.stringify({
      email: 'secure@example.com',
      password: 'SecurePassword!123',
      acknowledgeSimulationAndRisk: true,
    })), env);
    expect(httpsSignup.status).toBe(201);
    expect(httpsSignup.headers.get('Set-Cookie') ?? '').toContain('Secure');
  });
});
