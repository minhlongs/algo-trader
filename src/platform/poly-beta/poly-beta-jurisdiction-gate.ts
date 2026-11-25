/**
 * International Paper Beta — Fail-Closed Jurisdiction Onboarding Gate (#POLY-G10.5).
 *
 * Enforces `TARGET_VIETNAM_CUSTOMERS=false`, OFAC & Polymarket restricted exclusions,
 * non-VPN attestation, and authenticated Cloudflare edge country/subdivision consistency.
 */

import {
  classifyPolymarketJurisdiction,
  normalizeCountryCode,
  normalizeSubdivisionCode,
} from '../../shared/polymarket/venue-eligibility-jurisdictions';
import { hmacSha256Hex, timingSafeHexEqual } from './poly-beta-security';
import type { PolyBetaEnv } from './poly-beta-types';

const PROXY_SIG_MAX_SKEW_MS = 60_000;
const DIGITS_ONLY_RE = /^\d+$/;

export type SignupJurisdictionErrorCode =
  | 'JURISDICTION_ATTESTATION_REQUIRED'
  | 'JURISDICTION_EDGE_SIGNAL_MISSING'
  | 'JURISDICTION_EDGE_MISMATCH'
  | 'JURISDICTION_VIETNAM_EXCLUDED'
  | 'JURISDICTION_RESTRICTED';

export type SignupJurisdictionGateResult =
  | { readonly ok: true; readonly verifiedCountry: string | null; readonly verifiedRegion: string | null; readonly edgeCountry: string | null }
  | { readonly ok: false; readonly status: 403; readonly code: SignupJurisdictionErrorCode; readonly error: string };

export interface SignupJurisdictionInput {
  readonly countryCode?: string | undefined;
  readonly regionCode?: string | undefined;
  readonly acknowledgeJurisdictionAndNonVpn?: boolean | undefined;
}

interface CloudflareRequestWithCf extends Request {
  readonly cf?: { readonly country?: unknown; readonly regionCode?: unknown };
}

interface ResolvedEdgeSignal {
  readonly country: string | null;
  readonly region: string | null;
  readonly isAnonymizer: boolean;
  readonly invalidProxyAuth: boolean;
}

function failJurisdiction(code: SignupJurisdictionErrorCode, error: string): SignupJurisdictionGateResult {
  return { ok: false, status: 403, code, error };
}

function isAnonymizerCode(raw: string | null | undefined): boolean {
  const c = typeof raw === 'string' ? raw.trim().toUpperCase() : '';
  return c === 'T1' || c === 'XX';
}

export async function resolveEdgeCountryAndRegion(
  request: Request,
  env: PolyBetaEnv,
  nowMs: number,
): Promise<ResolvedEdgeSignal> {
  const secret = env.POLY_BETA_PROXY_SECRET?.trim();
  if (secret) {
    const forwardedIp = request.headers.get('X-Poly-Beta-Client-IP')?.trim();
    const forwardedCountryRaw = request.headers.get('X-Poly-Beta-Client-Country')?.trim() ?? '';
    const forwardedRegionRaw = request.headers.get('X-Poly-Beta-Client-Region')?.trim() ?? '';
    const tsRaw = request.headers.get('X-Poly-Beta-Proxy-Ts')?.trim() ?? '';
    const sig = request.headers.get('X-Poly-Beta-Proxy-Sig')?.trim();
    const hasDelimiter =
      (forwardedIp?.includes('|') ?? false) ||
      forwardedCountryRaw.includes('|') ||
      forwardedRegionRaw.includes('|');
    const ts = DIGITS_ONLY_RE.test(tsRaw) ? Number.parseInt(tsRaw, 10) : Number.NaN;
    if (!hasDelimiter && forwardedIp && sig && Number.isFinite(ts) && Math.abs(nowMs - ts) <= PROXY_SIG_MAX_SKEW_MS) {
      const expected = await hmacSha256Hex(secret, `${forwardedIp}|${forwardedCountryRaw}|${forwardedRegionRaw}|${tsRaw}`);
      if (timingSafeHexEqual(sig, expected)) {
        const country = normalizeCountryCode(forwardedCountryRaw);
        const region = normalizeSubdivisionCode(country, forwardedRegionRaw);
        return { country, region, isAnonymizer: isAnonymizerCode(forwardedCountryRaw), invalidProxyAuth: false };
      }
      if (env.ENVIRONMENT !== 'public-beta' && !forwardedCountryRaw && !forwardedRegionRaw) {
        const legacyExpected = await hmacSha256Hex(secret, `${forwardedIp}:${tsRaw}`);
        if (timingSafeHexEqual(sig, legacyExpected)) {
          return { country: null, region: null, isAnonymizer: false, invalidProxyAuth: false };
        }
      }
    }
    // Fail-closed whenever POLY_BETA_PROXY_SECRET is configured and HMAC verification fails (any environment).
    return { country: null, region: null, isAnonymizer: false, invalidProxyAuth: true };
  }

  const cfReq = request as CloudflareRequestWithCf;
  const cfObjCountry = typeof cfReq.cf?.country === 'string' ? cfReq.cf.country : null;
  const cfObjRegion = typeof cfReq.cf?.regionCode === 'string' ? cfReq.cf.regionCode : null;
  const rawCountry = cfObjCountry ?? request.headers.get('CF-IPCountry');
  const country = normalizeCountryCode(rawCountry);
  const region = normalizeSubdivisionCode(country, cfObjRegion);
  return { country, region, isAnonymizer: isAnonymizerCode(rawCountry), invalidProxyAuth: false };
}

function checkAllowedTerritory(
  countryCode: string,
  regionCode: string | null,
  allowVietnamCustomers: boolean,
): SignupJurisdictionGateResult | null {
  if (countryCode === 'VN' && !allowVietnamCustomers) {
    return failJurisdiction(
      'JURISDICTION_VIETNAM_EXCLUDED',
      'International Paper Beta does not onboard Vietnam customer accounts (TARGET_VIETNAM_CUSTOMERS=false).',
    );
  }
  const check = classifyPolymarketJurisdiction(countryCode, regionCode);
  if (check.restrictedForTrading) {
    return failJurisdiction(
      'JURISDICTION_RESTRICTED',
      `Paper Beta onboarding is unavailable in restricted or undisambiguated jurisdiction (${regionCode ?? countryCode}). VPN or proxy circumvention is prohibited.`,
    );
  }
  return null;
}

export async function authorizeSignupJurisdiction(
  request: Request,
  input: SignupJurisdictionInput,
  env: PolyBetaEnv,
  nowMs: number,
): Promise<SignupJurisdictionGateResult> {
  const isProdBeta = env.ENVIRONMENT === 'public-beta';
  const allowVietnam =
    typeof env.TARGET_VIETNAM_CUSTOMERS === 'string' && env.TARGET_VIETNAM_CUSTOMERS.trim().toLowerCase() === 'true';

  const edge = await resolveEdgeCountryAndRegion(request, env, nowMs);
  if (edge.invalidProxyAuth) {
    return failJurisdiction('JURISDICTION_EDGE_SIGNAL_MISSING', 'Authenticated Pages proxy country signature is missing or invalid.');
  }
  if (edge.isAnonymizer) {
    return failJurisdiction('JURISDICTION_RESTRICTED', 'Anonymizer, Tor, or unverifiable network origin is prohibited.');
  }

  const declaredCountry = normalizeCountryCode(input.countryCode);
  const declaredRegion = normalizeSubdivisionCode(declaredCountry, input.regionCode);

  if (input.acknowledgeJurisdictionAndNonVpn === false) {
    return failJurisdiction('JURISDICTION_ATTESTATION_REQUIRED', 'Non-restricted jurisdiction and non-VPN attestation is required.');
  }
  if (isProdBeta && (!declaredCountry || input.acknowledgeJurisdictionAndNonVpn !== true)) {
    return failJurisdiction(
      'JURISDICTION_ATTESTATION_REQUIRED',
      'Declared ISO country code and non-VPN jurisdiction attestation are required in public-beta.',
    );
  }
  if (isProdBeta && !edge.country) {
    return failJurisdiction('JURISDICTION_EDGE_SIGNAL_MISSING', 'Verified Cloudflare edge country signal is required in public-beta.');
  }
  if (edge.country) {
    const err = checkAllowedTerritory(edge.country, edge.region, allowVietnam);
    if (err) return err;
  }
  if (input.countryCode !== undefined && !declaredCountry) {
    return failJurisdiction('JURISDICTION_RESTRICTED', 'Declared country code must be a valid ISO 3166-1 alpha-2 code.');
  }
  if (declaredCountry) {
    const err = checkAllowedTerritory(declaredCountry, declaredRegion ?? edge.region, allowVietnam);
    if (err) return err;
    if (edge.country && edge.country !== declaredCountry) {
      return failJurisdiction(
        'JURISDICTION_EDGE_MISMATCH',
        'Declared country does not match detected network jurisdiction; VPN or proxy routing is prohibited.',
      );
    }
    if (edge.region && declaredRegion && edge.region !== declaredRegion) {
      return failJurisdiction(
        'JURISDICTION_EDGE_MISMATCH',
        'Declared region does not match detected network subdivision; VPN or proxy routing is prohibited.',
      );
    }
  }
  return { ok: true, verifiedCountry: declaredCountry ?? edge.country, verifiedRegion: edge.region ?? declaredRegion, edgeCountry: edge.country };
}
