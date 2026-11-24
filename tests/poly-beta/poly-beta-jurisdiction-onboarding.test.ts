import { describe, expect, it } from 'vitest';
import { onRequest } from '../../dashboard/functions/api/beta/[[path]]';
import worker from '../../src/platform/poly-beta/poly-beta-worker';
import { buildTestInvitesJson, createPolyBetaTestHarness, testInviteTokenForEmail } from './poly-beta-test-harness';

const ORIGIN = 'https://poly-beta-dashboard.pages.dev';
const SIGNUP_URL = 'https://poly-beta-api.internal/api/beta/auth/signup';
const PASSWORD = 'Pilot#Password2026!';

function makeSignupReq(
  email: string,
  inviteToken: string,
  opts: {
    countryCode?: string;
    regionCode?: string;
    ackJurisdiction?: boolean;
    cfIpCountry?: string;
    extraHeaders?: Record<string, string>;
    cfObject?: { country?: string; regionCode?: string };
    ip?: string;
  } = {},
): Request {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Origin: ORIGIN,
    'CF-Connecting-IP': opts.ip ?? '198.51.100.25',
    ...(opts.extraHeaders ?? {}),
  };
  if (opts.cfIpCountry !== undefined) headers['CF-IPCountry'] = opts.cfIpCountry;
  const req = new Request(SIGNUP_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      email,
      password: PASSWORD,
      inviteToken,
      acknowledgeSimulationAndRisk: true,
      ...(opts.countryCode !== undefined ? { countryCode: opts.countryCode } : {}),
      ...(opts.regionCode !== undefined ? { regionCode: opts.regionCode } : {}),
      ...(opts.ackJurisdiction !== undefined ? { acknowledgeJurisdictionAndNonVpn: opts.ackJurisdiction } : {}),
    }),
  });
  if (opts.cfObject) Object.defineProperty(req, 'cf', { value: opts.cfObject });
  return req;
}

describe('#POLY-G10.5 — International Paper Beta Jurisdiction-Aware Onboarding', () => {
  it('exposes international English-first USD positioning and data-rights provenance on /api/health', async () => {
    const { env } = await createPolyBetaTestHarness({ marketDataEnabled: 'false', maintenanceMode: 'true' });
    const res = await worker.fetch(new Request('https://poly-beta-api.internal/api/health'), env);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      mode: 'PAPER_ONLY',
      targetMarket: 'INTERNATIONAL',
      targetVietnamCustomers: false,
      productLanguage: 'en',
      accountingCurrency: 'USD',
      liveTradingEnabled: false,
      marketDataEnabled: false,
    });
  });

  it('rejects VN, OFAC, restricted countries, Tor, CA-ON/UA-43 self-attestation spoofing, and unsigned proxy fallback', async () => {
    const email = 'intl-researcher@example.com';
    const token = testInviteTokenForEmail(email, 'g10-5');
    const { env, rawSqlite } = await createPolyBetaTestHarness({
      signupAllowlist: email,
      signupInvites: buildTestInvitesJson([{ rawToken: token, email }]),
    });
    env.ENVIRONMENT = 'public-beta';
    env.TARGET_VIETNAM_CUSTOMERS = 'false';

    // 1. Vietnam customer blocked (TARGET_VIETNAM_CUSTOMERS=false)
    const vnRes = await worker.fetch(
      makeSignupReq(email, token, { countryCode: 'VN', ackJurisdiction: true, cfIpCountry: 'VN', ip: '198.51.100.1' }),
      env,
    );
    expect(vnRes.status).toBe(403);
    expect(((await vnRes.json()) as { code?: string }).code).toBe('JURISDICTION_VIETNAM_EXCLUDED');

    // 2. OFAC & Polymarket restricted countries blocked
    for (const [idx, code] of ['IR', 'US', 'GB', 'SG'].entries()) {
      const res = await worker.fetch(
        makeSignupReq(email, token, { countryCode: code, ackJurisdiction: true, cfIpCountry: code, ip: `198.51.100.${10 + idx}` }),
        env,
      );
      expect(res.status).toBe(403);
      expect(((await res.json()) as { code?: string }).code).toBe('JURISDICTION_RESTRICTED');
    }

    // 3. Adversarial CA/UA bypass blocked: CA without verified cf.regionCode cannot self-declare MB, nor spoof X-Poly-Beta-Region
    const caSpoofRes = await worker.fetch(
      makeSignupReq(email, token, {
        countryCode: 'CA',
        regionCode: 'MB',
        ackJurisdiction: true,
        cfIpCountry: 'CA',
        extraHeaders: { 'X-Poly-Beta-Region': 'MB' },
        ip: '198.51.100.30',
      }),
      env,
    );
    expect(caSpoofRes.status).toBe(403);
    expect(((await caSpoofRes.json()) as { code?: string }).code).toBe('JURISDICTION_RESTRICTED');

    // 4. Verified cf.regionCode CA-ON vs self-declared MB blocked on edge check
    const caOnSpoof = await worker.fetch(
      makeSignupReq(email, token, {
        countryCode: 'CA',
        regionCode: 'MB',
        ackJurisdiction: true,
        cfObject: { country: 'CA', regionCode: 'ON' },
        ip: '198.51.100.31',
      }),
      env,
    );
    expect(caOnSpoof.status).toBe(403);
    expect(((await caOnSpoof.json()) as { code?: string }).code).toBe('JURISDICTION_RESTRICTED');

    // 5. Tor / anonymizer CF-IPCountry T1 & edge mismatch blocked
    const torRes = await worker.fetch(
      makeSignupReq(email, token, { countryCode: 'CH', ackJurisdiction: true, cfIpCountry: 'T1', ip: '198.51.100.32' }),
      env,
    );
    expect(((await torRes.json()) as { code?: string }).code).toBe('JURISDICTION_RESTRICTED');

    const mismatchRes = await worker.fetch(
      makeSignupReq(email, token, { countryCode: 'CH', ackJurisdiction: true, cfIpCountry: 'SE', ip: '198.51.100.33' }),
      env,
    );
    expect(((await mismatchRes.json()) as { code?: string }).code).toBe('JURISDICTION_EDGE_MISMATCH');

    // 6. Fail-closed when POLY_BETA_PROXY_SECRET is configured and request lacks valid HMAC signature (never trusts unsigned CF-IPCountry)
    env.POLY_BETA_PROXY_SECRET = 'enforced-proxy-secret';
    const unsignedProxyBypass = await worker.fetch(
      makeSignupReq(email, token, {
        countryCode: 'CH',
        ackJurisdiction: true,
        cfIpCountry: 'CH',
        extraHeaders: { 'X-Poly-Beta-Proxy-Sig': 'deadbeef'.repeat(8) },
        ip: '198.51.100.34',
      }),
      env,
    );
    expect(unsignedProxyBypass.status).toBe(403);
    expect(((await unsignedProxyBypass.json()) as { code?: string }).code).toBe('JURISDICTION_EDGE_SIGNAL_MISSING');

    const count = rawSqlite.prepare('SELECT COUNT(*) as c FROM beta_users').get() as { c: number };
    expect(count.c).toBe(0);
  });

  it('onboards a disambiguated CA-MB researcher via IPv6 HMAC-signed Pages Service Binding proxy', async () => {
    const mbEmail = 'manitoba-quant@example.com';
    const mbToken = testInviteTokenForEmail(mbEmail, 'mb-1');
    const { env, rawSqlite } = await createPolyBetaTestHarness({
      signupAllowlist: mbEmail,
      signupInvites: buildTestInvitesJson([{ rawToken: mbToken, email: mbEmail }]),
    });
    env.ENVIRONMENT = 'public-beta';
    env.POLY_BETA_PROXY_SECRET = 'g10-5-proxy-hmac-secret';

    const mbReq = new Request('https://poly-beta-dashboard.pages.dev/api/beta/auth/signup', {
      method: 'POST',
      headers: {
        Origin: ORIGIN,
        'Sec-Fetch-Site': 'same-origin',
        'Content-Type': 'application/json',
        'CF-Connecting-IP': '2001:db8::88',
        'X-Poly-Beta-Client-Country': 'US',
        'X-Poly-Beta-Client-Region': 'ON',
      },
      body: JSON.stringify({
        email: mbEmail,
        password: PASSWORD,
        inviteToken: mbToken,
        countryCode: 'CA',
        regionCode: 'MB',
        acknowledgeSimulationAndRisk: true,
        acknowledgeJurisdictionAndNonVpn: true,
      }),
    });
    Object.defineProperty(mbReq, 'cf', { value: { country: 'CA', regionCode: 'MB' } });

    const proxyRes = await onRequest({
      request: mbReq,
      env: {
        POLY_BETA_PROXY_SECRET: 'g10-5-proxy-hmac-secret',
        POLY_BETA_API: { fetch: (input, init) => worker.fetch(new Request(String(input), init), env) },
      },
    } as unknown as Parameters<typeof onRequest>[0]);

    expect(proxyRes.status).toBe(201);
    const logRow = rawSqlite
      .prepare("SELECT detail FROM beta_execution_logs WHERE event_code = 'ACCOUNT_CREATED'")
      .get() as { detail: string } | undefined;
    expect(logRow?.detail).toContain('jurisdiction=CA-MB');
  });
});
