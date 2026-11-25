import { describe, expect, it } from 'vitest';
import { onRequest } from '../../dashboard/functions/api/beta/[[path]]';
import {
  authorizeSignupJurisdiction,
  resolveEdgeCountryAndRegion,
} from '../../src/platform/poly-beta/poly-beta-jurisdiction-gate';
import { hmacSha256Hex } from '../../src/platform/poly-beta/poly-beta-security';
import { createPolyBetaTestHarness } from './poly-beta-test-harness';

const SIGNUP_URL = 'https://poly-beta-api.internal/api/beta/auth/signup';
const PROXY_SECRET = 'test-g10-6-proxy-secret-key';

async function buildSignedRequest(
  ip: string,
  country: string,
  region: string,
  tsMs: number,
  sigOverride?: string,
): Promise<Request> {
  const tsRaw = String(tsMs);
  const sig = sigOverride ?? (await hmacSha256Hex(PROXY_SECRET, `${ip}|${country}|${region}|${tsRaw}`));
  const headers: Record<string, string> = {
    'X-Poly-Beta-Client-IP': ip,
    'X-Poly-Beta-Proxy-Ts': tsRaw,
    'X-Poly-Beta-Proxy-Sig': sig,
  };
  if (country) headers['X-Poly-Beta-Client-Country'] = country;
  if (region) headers['X-Poly-Beta-Client-Region'] = region;
  return new Request(SIGNUP_URL, { method: 'POST', headers });
}

describe('International Paper Beta — Adversarial Proxy & Jurisdiction Gate', () => {
  it('rejects ambiguous pipe-delimiter injection, expired timestamps, future timestamps, and invalid HMAC', async () => {
    const { env } = await createPolyBetaTestHarness();
    env.ENVIRONMENT = 'public-beta';
    env.POLY_BETA_PROXY_SECRET = PROXY_SECRET;
    const now = 1_760_000_000_000;

    // Pipe delimiter in IP or country must fail closed even with a matching HMAC
    const pipeIpReq = await buildSignedRequest('198.51.100.1|DE', '', '', now);
    expect((await resolveEdgeCountryAndRegion(pipeIpReq, env, now)).invalidProxyAuth).toBe(true);

    const pipeCountryReq = await buildSignedRequest('198.51.100.1', 'DE|BE', '', now);
    expect((await resolveEdgeCountryAndRegion(pipeCountryReq, env, now)).invalidProxyAuth).toBe(true);

    // Expired timestamp (> 60s old)
    const expiredReq = await buildSignedRequest('198.51.100.1', 'DE', '', now - 61_000);
    expect((await resolveEdgeCountryAndRegion(expiredReq, env, now)).invalidProxyAuth).toBe(true);

    // Future timestamp (> 60s ahead)
    const futureReq = await buildSignedRequest('198.51.100.1', 'DE', '', now + 61_000);
    expect((await resolveEdgeCountryAndRegion(futureReq, env, now)).invalidProxyAuth).toBe(true);

    // Forged HMAC signature
    const forgedReq = await buildSignedRequest('198.51.100.1', 'DE', '', now, '0'.repeat(64));
    expect((await resolveEdgeCountryAndRegion(forgedReq, env, now)).invalidProxyAuth).toBe(true);

    // Valid signature succeeds
    const validReq = await buildSignedRequest('198.51.100.1', 'CA', 'MB', now);
    const validEdge = await resolveEdgeCountryAndRegion(validReq, env, now);
    expect(validEdge).toEqual({ country: 'CA', region: 'CA-MB', isAnonymizer: false, invalidProxyAuth: false });
  });

  it('enforces attestation, missing edge country, malformed country, and country/region mismatch', async () => {
    const { env } = await createPolyBetaTestHarness();
    env.ENVIRONMENT = 'public-beta';
    env.POLY_BETA_PROXY_SECRET = PROXY_SECRET;
    const now = 1_760_000_000_000;

    // 1. Explicit false attestation rejected
    const chReq = await buildSignedRequest('198.51.100.2', 'CH', '', now);
    const noAck = await authorizeSignupJurisdiction(
      chReq,
      { countryCode: 'CH', acknowledgeJurisdictionAndNonVpn: false },
      env,
      now,
    );
    expect(noAck.ok).toBe(false);
    if (!noAck.ok) expect(noAck.code).toBe('JURISDICTION_ATTESTATION_REQUIRED');

    // 2. Missing declared country in public-beta rejected
    const missingDecl = await authorizeSignupJurisdiction(
      chReq,
      { acknowledgeJurisdictionAndNonVpn: true },
      env,
      now,
    );
    expect(missingDecl.ok).toBe(false);
    if (!missingDecl.ok) expect(missingDecl.code).toBe('JURISDICTION_ATTESTATION_REQUIRED');

    // 3. Missing edge country in public-beta rejected
    const emptyCountryReq = await buildSignedRequest('198.51.100.3', '', '', now);
    const missingEdge = await authorizeSignupJurisdiction(
      emptyCountryReq,
      { countryCode: 'CH', acknowledgeJurisdictionAndNonVpn: true },
      env,
      now,
    );
    expect(missingEdge.ok).toBe(false);
    if (!missingEdge.ok) expect(missingEdge.code).toBe('JURISDICTION_EDGE_SIGNAL_MISSING');

    // 4. Malformed country in non-public-beta rejected
    const devEnv = { ...env, ENVIRONMENT: 'local-dev', POLY_BETA_PROXY_SECRET: undefined };
    const malformed = await authorizeSignupJurisdiction(
      new Request(SIGNUP_URL, { method: 'POST', headers: { 'CF-IPCountry': 'CH' } }),
      { countryCode: 'INVALID_CODE', acknowledgeJurisdictionAndNonVpn: true },
      devEnv,
      now,
    );
    expect(malformed.ok).toBe(false);
    if (!malformed.ok) expect(malformed.code).toBe('JURISDICTION_RESTRICTED');

    // 5. Country mismatch rejected (both CH and SE are allowed jurisdictions)
    const countryMismatch = await authorizeSignupJurisdiction(
      chReq,
      { countryCode: 'SE', acknowledgeJurisdictionAndNonVpn: true },
      env,
      now,
    );
    expect(countryMismatch.ok).toBe(false);
    if (!countryMismatch.ok) expect(countryMismatch.code).toBe('JURISDICTION_EDGE_MISMATCH');

    // 6. Subdivision mismatch rejected
    const chZhReq = await buildSignedRequest('198.51.100.4', 'CH', 'ZH', now);
    const regionMismatch = await authorizeSignupJurisdiction(
      chZhReq,
      { countryCode: 'CH', regionCode: 'GE', acknowledgeJurisdictionAndNonVpn: true },
      env,
      now,
    );
    expect(regionMismatch.ok).toBe(false);
    if (!regionMismatch.ok) expect(regionMismatch.code).toBe('JURISDICTION_EDGE_MISMATCH');
  });

  it('Pages proxy fails closed when service binding is missing on production host and strips forged headers', async () => {
    const req = new Request('https://poly-beta-dashboard.pages.dev/api/beta/auth/signup', {
      method: 'POST',
      headers: {
        Origin: 'https://poly-beta-dashboard.pages.dev',
        'Sec-Fetch-Site': 'same-origin',
        'X-Poly-Beta-Client-Country': 'DE',
        'X-Poly-Beta-Proxy-Sig': 'forged',
      },
      body: JSON.stringify({ email: 'a@b.com' }),
    });
    const res = await onRequest({
      request: req,
      env: { POLY_BETA_API_ORIGIN: 'http://127.0.0.1:8787' },
    } as Parameters<typeof onRequest>[0]);
    expect(res.status).toBe(503);
    expect(((await res.json()) as { code?: string }).code).toBe('SERVICE_BINDING_MISSING');
  });
});
