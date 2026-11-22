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
import { createPolyBetaTestHarness } from './poly-beta-test-harness';

const ORIGIN = 'https://poly-beta-dashboard.pages.dev';
const API_URL = 'https://poly-beta-api.workers.dev/api/beta/auth/signup';
const STRONG_PASSWORD = 'Pilot#Password2026!';

function buildSignupRequest(email: string, ip = '203.0.113.50'): Request {
  return new Request(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: ORIGIN,
      'CF-Connecting-IP': ip,
    },
    body: JSON.stringify({
      email,
      password: STRONG_PASSWORD,
      acknowledgeSimulationAndRisk: true,
    }),
  });
}

describe('Paper Beta P0 — fail-closed signup allowlist', () => {
  it('fails closed when BETA_SIGNUP_ALLOWLIST is missing, empty, or contains wildcards', async () => {
    for (const raw of [undefined, '', '   ', '*', '*@example.com', 'sha256:not-a-hex-digest']) {
      const { env, rawSqlite } = await createPolyBetaTestHarness({ signupAllowlist: raw });
      env.SIGNUP_GATE_MODE = 'open'; // Must still fail closed — no default-allow mode exists

      const res = await worker.fetch(buildSignupRequest('public-attacker@example.com'), env);
      expect(res.status).toBe(403);
      const body = (await res.json()) as { code?: string };
      expect(body.code).toBe('SIGNUP_ALLOWLIST_REQUIRED');

      const count = rawSqlite.prepare('SELECT COUNT(*) as c FROM beta_users').get() as { c: number };
      expect(count.c).toBe(0);
    }

    expect(parseSignupAllowlist('*, *@example.com, invalid').emails.size).toBe(0);
    expect(parseSignupAllowlist('*, *@example.com, invalid').hashes.size).toBe(0);
  });

  it('rejects unauthorized emails while permitting explicitly enrolled USER_001 (plaintext & sha256) and blocking duplicates', async () => {
    const user001Email = 'user001-pilot@example.com';
    const user001Hash = await sha256Hex(user001Email);

    // 1. Plaintext allowlist enrollment
    const plainHarness = await createPolyBetaTestHarness({
      signupAllowlist: ` ${user001Email.toUpperCase()} `,
    });
    const unauth = await worker.fetch(buildSignupRequest('intruder@example.com'), plainHarness.env);
    expect(unauth.status).toBe(403);
    expect(((await unauth.json()) as { code?: string }).code).toBe('SIGNUP_ALLOWLIST_REQUIRED');

    const okPlain = await worker.fetch(buildSignupRequest('USER001-PILOT@example.com'), plainHarness.env);
    expect(okPlain.status).toBe(201);
    const plainBody = (await okPlain.json()) as { ok: boolean; mode: string; initialCapitalUsd: number; user: { email: string } };
    expect(plainBody.ok).toBe(true);
    expect(plainBody.mode).toBe('PAPER_ONLY');
    expect(plainBody.initialCapitalUsd).toBe(100);
    expect(plainBody.user.email).toBe(user001Email);

    // Duplicate signup for already-enrolled user returns 409 EMAIL_EXISTS
    const dup = await worker.fetch(buildSignupRequest(user001Email), plainHarness.env);
    expect(dup.status).toBe(409);
    expect(((await dup.json()) as { code?: string }).code).toBe('EMAIL_EXISTS');

    // 2. Privacy-preserving sha256:<hex> allowlist enrollment
    const hashHarness = await createPolyBetaTestHarness({
      signupAllowlist: `sha256:${user001Hash}`,
    });
    const okHash = await worker.fetch(buildSignupRequest(user001Email), hashHarness.env);
    expect(okHash.status).toBe(201);

    const nonMatch = await isEmailAuthorizedForBetaSignup('other@example.com', hashHarness.env);
    expect(nonMatch).toEqual({ allowed: false, reason: 'SIGNUP_EMAIL_NOT_ENROLLED' });
  });

  it('retains signup rate limiting and tenant isolation between explicitly enrolled accounts', async () => {
    const { env } = await createPolyBetaTestHarness({
      signupAllowlist: 'pilot-a@example.com,pilot-b@example.com',
    });

    // Rate limiting applies even to unauthorized signup attempts (10/min -> 11th returns 429)
    for (let i = 0; i < 10; i++) {
      const r = await worker.fetch(buildSignupRequest(`probe${i}@example.com`, '198.51.100.77'), env);
      expect(r.status).toBe(403);
    }
    const throttled = await worker.fetch(buildSignupRequest('pilot-a@example.com', '198.51.100.77'), env);
    expect(throttled.status).toBe(429);

    // Separate IPs for enrolled pilot A & pilot B get isolated tenants
    const resA = await worker.fetch(buildSignupRequest('pilot-a@example.com', '198.51.100.1'), env);
    const resB = await worker.fetch(buildSignupRequest('pilot-b@example.com', '198.51.100.2'), env);
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
