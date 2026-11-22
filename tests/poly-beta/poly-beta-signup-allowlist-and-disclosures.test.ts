import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import worker from '../../src/platform/poly-beta/poly-beta-worker';
import { sha256Hex } from '../../src/platform/poly-beta/poly-beta-security';
import {
  isEmailAuthorizedForBetaSignup,
  parseSignupAllowlist,
} from '../../src/platform/poly-beta/poly-beta-signup-allowlist';
import {
  POLY_BETA_INDEX_HTML,
  transformDashboardHtmlForMode,
} from '../../dashboard/poly-beta-html-metadata';
import {
  buildTestInvitesJson,
  createPolyBetaTestHarness,
  testInviteTokenForEmail,
} from './poly-beta-test-harness';

const ORIGIN = 'https://poly-beta-dashboard.pages.dev';
const API_URL = 'https://poly-beta-api.workers.dev/api/beta/auth/signup';
const STRONG_PASSWORD = 'Pilot#Password2026!';

function buildSignupRequest(
  email: string,
  options?: { inviteToken?: string | undefined; ip?: string; urlSuffix?: string },
): Request {
  const payload: Record<string, unknown> = {
    email,
    password: STRONG_PASSWORD,
    acknowledgeSimulationAndRisk: true,
  };
  if (options && 'inviteToken' in options && options.inviteToken !== undefined) {
    payload.inviteToken = options.inviteToken;
  }
  return new Request(`${API_URL}${options?.urlSuffix ?? ''}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: ORIGIN,
      'CF-Connecting-IP': options?.ip ?? '203.0.113.50',
    },
    body: JSON.stringify(payload),
  });
}

describe('Paper Beta P0 — fail-closed signup allowlist & one-time invite proof', () => {
  it('fails closed when BETA_SIGNUP_ALLOWLIST is missing, empty, or contains wildcards', async () => {
    const token = testInviteTokenForEmail('public-attacker@example.com');
    const invites = buildTestInvitesJson([{ rawToken: token, email: 'public-attacker@example.com' }]);

    for (const raw of [undefined, '', '   ', '*', '*@example.com', 'sha256:not-a-hex-digest']) {
      const { env, rawSqlite } = await createPolyBetaTestHarness({
        signupAllowlist: raw,
        signupInvites: invites,
      });
      env.SIGNUP_GATE_MODE = 'open'; // Must still fail closed — no default-allow mode exists

      const res = await worker.fetch(buildSignupRequest('public-attacker@example.com', { inviteToken: token }), env);
      expect(res.status).toBe(403);
      const body = (await res.json()) as { code?: string };
      expect(body.code).toBe('SIGNUP_ALLOWLIST_REQUIRED');

      const count = rawSqlite.prepare('SELECT COUNT(*) as c FROM beta_users').get() as { c: number };
      expect(count.c).toBe(0);
    }

    expect(parseSignupAllowlist('*, *@example.com, invalid').emails.size).toBe(0);
    expect(parseSignupAllowlist('*, *@example.com, invalid').hashes.size).toBe(0);
  });

  it('rejects unauthorized emails, missing invites, invalid tokens, sha256(email), and URL tokens', async () => {
    const user001Email = 'user001-pilot@example.com';
    const user001Token = testInviteTokenForEmail(user001Email, 'pilot-1');
    const user001EmailHash = await sha256Hex(user001Email);

    const { env, rawSqlite } = await createPolyBetaTestHarness({
      signupAllowlist: ` ${user001Email.toUpperCase()} `,
      signupInvites: buildTestInvitesJson([{ rawToken: user001Token, email: user001Email }]),
    });

    // Unauthorized email
    const unauth = await worker.fetch(buildSignupRequest('intruder@example.com', { inviteToken: user001Token }), env);
    expect(unauth.status).toBe(403);
    expect(((await unauth.json()) as { code?: string }).code).toBe('SIGNUP_ALLOWLIST_REQUIRED');

    // Correct allowlist but missing invite token
    const missingInvite = await worker.fetch(buildSignupRequest(user001Email), env);
    expect(missingInvite.status).toBe(403);
    expect(((await missingInvite.json()) as { code?: string }).code).toBe('INVITE_TOKEN_REQUIRED');

    // Correct email but invalid token
    const wrongToken = await worker.fetch(
      buildSignupRequest(user001Email, { inviteToken: 'f'.repeat(64) }),
      env,
    );
    expect(wrongToken.status).toBe(403);
    expect(((await wrongToken.json()) as { code?: string }).code).toBe('INVITE_TOKEN_INVALID');

    // Explicitly refuse SHA-256(email) as an authentication factor
    const emailHashAsToken = await worker.fetch(
      buildSignupRequest(user001Email, { inviteToken: user001EmailHash }),
      env,
    );
    expect(emailHashAsToken.status).toBe(403);
    expect(((await emailHashAsToken.json()) as { code?: string }).code).toBe('INVITE_TOKEN_INVALID');

    // Refuse invite token passed via URL query string (prevents referrer/access-log leakage)
    const urlLeak = await worker.fetch(
      buildSignupRequest(user001Email, { inviteToken: user001Token, urlSuffix: `?inviteToken=${user001Token}` }),
      env,
    );
    expect(urlLeak.status).toBe(403);
    expect(((await urlLeak.json()) as { code?: string }).code).toBe('CALLER_SCOPE_FORBIDDEN');

    const count = rawSqlite.prepare('SELECT COUNT(*) as c FROM beta_users').get() as { c: number };
    expect(count.c).toBe(0);
  });

  it('rejects expired, disabled, wrong-email, and missing-config invites', async () => {
    const emailA = 'pilot-a@example.com';
    const emailB = 'pilot-b@example.com';
    const expiredToken = testInviteTokenForEmail(emailA, 'expired');
    const disabledToken = testInviteTokenForEmail(emailA, 'disabled');
    const tokenForB = testInviteTokenForEmail(emailB, 'bound-b');

    // Missing BETA_SIGNUP_INVITES fails closed
    const noConfig = await createPolyBetaTestHarness({
      signupAllowlist: `${emailA},${emailB}`,
      signupInvites: undefined,
    });
    const noCfgRes = await worker.fetch(buildSignupRequest(emailA, { inviteToken: expiredToken }), noConfig.env);
    expect(noCfgRes.status).toBe(403);
    expect(((await noCfgRes.json()) as { code?: string }).code).toBe('INVITE_PROOF_UNAVAILABLE');

    const { env, rawSqlite } = await createPolyBetaTestHarness({
      signupAllowlist: `${emailA},${emailB}`,
      signupInvites: buildTestInvitesJson([
        { rawToken: expiredToken, email: emailA, expiresAtMs: Date.now() - 60_000 },
        { rawToken: disabledToken, email: emailA, disabled: true },
        { rawToken: tokenForB, email: emailB },
      ]),
    });

    // Expired token
    const expRes = await worker.fetch(buildSignupRequest(emailA, { inviteToken: expiredToken }), env);
    expect(expRes.status).toBe(403);
    expect(((await expRes.json()) as { code?: string }).code).toBe('INVITE_TOKEN_EXPIRED');

    // Disabled invitation
    const disRes = await worker.fetch(buildSignupRequest(emailA, { inviteToken: disabledToken }), env);
    expect(disRes.status).toBe(403);
    expect(((await disRes.json()) as { code?: string }).code).toBe('INVITE_TOKEN_DISABLED');

    // Token bound to another email (stolen token attempt)
    const mismatchRes = await worker.fetch(buildSignupRequest(emailA, { inviteToken: tokenForB }), env);
    expect(mismatchRes.status).toBe(403);
    expect(((await mismatchRes.json()) as { code?: string }).code).toBe('INVITE_EMAIL_MISMATCH');

    const count = rawSqlite.prepare('SELECT COUNT(*) as c FROM beta_users').get() as { c: number };
    expect(count.c).toBe(0);
  });

  it('permits first-use redemption (plaintext & sha256 allowlist), blocks replay, and never stores plaintext token', async () => {
    const user001Email = 'user001-pilot@example.com';
    const user001Token = testInviteTokenForEmail(user001Email, 'first-use');
    const user001SecondToken = testInviteTokenForEmail(user001Email, 'second-use');
    const user001EmailHash = await sha256Hex(user001Email);

    const { env, rawSqlite } = await createPolyBetaTestHarness({
      signupAllowlist: `sha256:${user001EmailHash}`,
      signupInvites: buildTestInvitesJson([
        { rawToken: user001Token, email: user001Email },
        { rawToken: user001SecondToken, email: user001Email },
      ]),
    });

    const ok = await worker.fetch(
      buildSignupRequest('USER001-PILOT@example.com', { inviteToken: user001Token }),
      env,
    );
    expect(ok.status).toBe(201);
    const body = (await ok.json()) as { ok: boolean; mode: string; initialCapitalUsd: number; user: { email: string } };
    expect(body.ok).toBe(true);
    expect(body.mode).toBe('PAPER_ONLY');
    expect(body.initialCapitalUsd).toBe(100);
    expect(body.user.email).toBe(user001Email);

    // Database stores only token hash, never plaintext token
    const row = rawSqlite
      .prepare('SELECT token_hash, email FROM beta_invite_redemptions WHERE email = ?')
      .get(user001Email) as { token_hash: string; email: string } | undefined;
    expect(row).toBeDefined();
    expect(row!.token_hash).toBe(await sha256Hex(user001Token));
    expect(row!.token_hash).not.toBe(user001Token);

    // Already redeemed / replayed token from another IP is rejected with 403 INVITE_TOKEN_REDEEMED
    const replay = await worker.fetch(
      buildSignupRequest(user001Email, { inviteToken: user001Token, ip: '198.51.100.99' }),
      env,
    );
    expect(replay.status).toBe(403);
    expect(((await replay.json()) as { code?: string }).code).toBe('INVITE_TOKEN_REDEEMED');

    // Duplicate email with a fresh second token returns 409 EMAIL_EXISTS
    const dup = await worker.fetch(
      buildSignupRequest(user001Email, { inviteToken: user001SecondToken, ip: '198.51.100.98' }),
      env,
    );
    expect(dup.status).toBe(409);
    expect(((await dup.json()) as { code?: string }).code).toBe('EMAIL_EXISTS');

    const nonMatch = await isEmailAuthorizedForBetaSignup('other@example.com', env);
    expect(nonMatch).toEqual({ allowed: false, reason: 'SIGNUP_EMAIL_NOT_ENROLLED' });
  });

  it('prevents concurrent double redemption atomically so only one signup succeeds', async () => {
    const email = 'concurrent-pilot@example.com';
    const token = testInviteTokenForEmail(email, 'race');
    const { env, rawSqlite } = await createPolyBetaTestHarness({
      signupAllowlist: email,
      signupInvites: buildTestInvitesJson([{ rawToken: token, email }]),
    });

    const [res1, res2] = await Promise.all([
      worker.fetch(buildSignupRequest(email, { inviteToken: token, ip: '198.51.100.10' }), env),
      worker.fetch(buildSignupRequest(email, { inviteToken: token, ip: '198.51.100.11' }), env),
    ]);

    const statuses = [res1.status, res2.status].sort((a, b) => a - b);
    expect(statuses).toEqual([201, 403]);

    const failedBody = (await (res1.status === 403 ? res1 : res2).json()) as { code?: string };
    expect(failedBody.code).toBe('INVITE_TOKEN_REDEEMED');

    const userCount = rawSqlite.prepare('SELECT COUNT(*) as c FROM beta_users').get() as { c: number };
    const redemptionCount = rawSqlite.prepare('SELECT COUNT(*) as c FROM beta_invite_redemptions').get() as { c: number };
    expect(userCount.c).toBe(1);
    expect(redemptionCount.c).toBe(1);
  });

  it('rolls back invite redemption on account provisioning failure and allows safe retry', async () => {
    const email = 'retry-pilot@example.com';
    const token = testInviteTokenForEmail(email, 'retry');
    const { env, rawSqlite } = await createPolyBetaTestHarness({
      signupAllowlist: email,
      signupInvites: buildTestInvitesJson([{ rawToken: token, email }]),
    });

    const originalBatch = env.POLY_BETA_DB.batch!.bind(env.POLY_BETA_DB);
    let failOnce = true;
    env.POLY_BETA_DB.batch = async (statements) => {
      if (failOnce) {
        failOnce = false;
        // Inject a mid-batch failure after the first statement would have run
        rawSqlite.exec('BEGIN IMMEDIATE');
        try {
          await statements[0]!.run();
          throw new Error('Simulated D1 provisioning failure');
        } catch (err) {
          rawSqlite.exec('ROLLBACK');
          throw err;
        }
      }
      return originalBatch(statements);
    };

    // First attempt fails during provisioning -> 500, zero accounts, token NOT consumed
    const failedRes = await worker.fetch(
      buildSignupRequest(email, { inviteToken: token, ip: '198.51.100.20' }),
      env,
    );
    expect(failedRes.status).toBe(500);

    expect((rawSqlite.prepare('SELECT COUNT(*) as c FROM beta_users').get() as { c: number }).c).toBe(0);
    expect(
      (rawSqlite.prepare('SELECT COUNT(*) as c FROM beta_invite_redemptions').get() as { c: number }).c,
    ).toBe(0);

    // Safe retry with the same valid token succeeds cleanly
    const retryRes = await worker.fetch(
      buildSignupRequest(email, { inviteToken: token, ip: '198.51.100.21' }),
      env,
    );
    expect(retryRes.status).toBe(201);
    expect((rawSqlite.prepare('SELECT COUNT(*) as c FROM beta_users').get() as { c: number }).c).toBe(1);
    expect(
      (rawSqlite.prepare('SELECT COUNT(*) as c FROM beta_invite_redemptions').get() as { c: number }).c,
    ).toBe(1);
  });

  it('retains signup rate limiting and tenant isolation between explicitly enrolled accounts', async () => {
    const tokenA = testInviteTokenForEmail('pilot-a@example.com', 'iso');
    const tokenB = testInviteTokenForEmail('pilot-b@example.com', 'iso');
    const { env } = await createPolyBetaTestHarness({
      signupAllowlist: 'pilot-a@example.com,pilot-b@example.com',
      signupInvites: buildTestInvitesJson([
        { rawToken: tokenA, email: 'pilot-a@example.com' },
        { rawToken: tokenB, email: 'pilot-b@example.com' },
      ]),
    });

    // Rate limiting applies even to unauthorized signup attempts (10/min -> 11th returns 429)
    for (let i = 0; i < 10; i++) {
      const r = await worker.fetch(buildSignupRequest(`probe${i}@example.com`, { ip: '198.51.100.77' }), env);
      expect(r.status).toBe(403);
    }
    const throttled = await worker.fetch(
      buildSignupRequest('pilot-a@example.com', { inviteToken: tokenA, ip: '198.51.100.77' }),
      env,
    );
    expect(throttled.status).toBe(429);

    // Separate IPs for enrolled pilot A & pilot B get isolated tenants
    const resA = await worker.fetch(
      buildSignupRequest('pilot-a@example.com', { inviteToken: tokenA, ip: '198.51.100.1' }),
      env,
    );
    const resB = await worker.fetch(
      buildSignupRequest('pilot-b@example.com', { inviteToken: tokenB, ip: '198.51.100.2' }),
      env,
    );
    expect(resA.status).toBe(201);
    expect(resB.status).toBe(201);
    const bodyA = (await resA.json()) as { user: { tenantId: string } };
    const bodyB = (await resB.json()) as { user: { tenantId: string } };
    expect(bodyA.user.tenantId).not.toBe(bodyB.user.tenantId);

    // Health endpoint explicitly reports allowlist gate mode and LIVE_TRADING_ENABLED=false
    const health = await worker.fetch(new Request('https://poly-beta-api.workers.dev/api/health'), env);
    expect(health.status).toBe(200);
    const healthBody = (await health.json()) as { signupGateMode: string; liveTradingEnabled: boolean };
    expect(healthBody.signupGateMode).toBe('allowlist');
    expect(healthBody.liveTradingEnabled).toBe(false);
  });
});

describe('Paper Beta P0 — truthful HTML & JSON-LD disclosures', () => {
  it('replaces commercial pricing/CLOB metadata with truthful Paper-Only disclosures in poly-beta mode', () => {
    const baseHtml = readFileSync(resolve(__dirname, '../../dashboard/index.html'), 'utf8');
    const betaHtml = transformDashboardHtmlForMode(baseHtml, 'poly-beta');
    expect(betaHtml).toBe(POLY_BETA_INDEX_HTML);

    // Required truthful Paper Beta disclosures
    expect(betaHtml).toContain('$100 virtual starting balance');
    expect(betaHtml).toMatch(/no real-money deposits/i);
    expect(betaHtml).toMatch(/no real orders/i);
    expect(betaHtml).toMatch(/no custody/i);
    expect(betaHtml).toMatch(/no promised profit/i);
    expect(betaHtml).toMatch(/no live-trading feature enabled/i);
    expect(betaHtml).toContain('noindex, nofollow');

    // Must not carry commercial pricing or live CLOB bot claims
    expect(betaHtml).not.toContain('$49');
    expect(betaHtml).not.toContain('$199');
    expect(betaHtml).not.toContain('Pro Tier');
    expect(betaHtml).not.toContain('Enterprise Tier');
    expect(betaHtml).not.toContain('non-custodial CLOB bot');
    expect(betaHtml).not.toContain('Quarter-Kelly');

    // JSON-LD must parse cleanly
    const ldMatch = betaHtml.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
    expect(ldMatch).not.toBeNull();
    const jsonLd = JSON.parse(ldMatch![1]!) as { name: string; offers: { price: string } };
    expect(jsonLd.name).toBe('Poly Bot vNext Paper Beta');
    expect(jsonLd.offers.price).toBe('0');

    // Standard CashClaw mode must remain unchanged
    expect(transformDashboardHtmlForMode(baseHtml, undefined)).toBe(baseHtml);
    expect(transformDashboardHtmlForMode(baseHtml, 'production')).toBe(baseHtml);
  });
});
