/**
 * POLY-G5 Public Beta — Request Origin/Sec-Fetch-Site, Client IP &
 * Upstream Negative-Cache Guards.
 */

import type { PolyBetaEnv } from './poly-beta-types';
import {
  betaJsonResponse,
  hmacSha256Hex,
  isOriginPermitted,
  timingSafeHexEqual,
} from './poly-beta-security';

const NEGATIVE_MARKET_CACHE_KEY = 'markets:neg:v1';
const NEGATIVE_BACKOFF_MS = 10_000;
const PROXY_SIG_MAX_SKEW_MS = 60_000;

export function resolveClientIpKey(request: Request, env: PolyBetaEnv): string {
  const cfIp = request.headers.get('CF-Connecting-IP')?.trim();
  if (cfIp) return cfIp;
  if (env.ENVIRONMENT === 'public-beta') {
    return 'edge-no-cf-ip';
  }
  const forwarded = request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim();
  return forwarded || 'anon';
}

export async function resolveVerifiedClientIpKey(
  request: Request,
  env: PolyBetaEnv,
  nowMs = Date.now(),
): Promise<string> {
  const secret = env.POLY_BETA_PROXY_SECRET?.trim();
  if (secret) {
    const forwardedIp = request.headers.get('X-Poly-Beta-Client-IP')?.trim();
    const tsRaw = request.headers.get('X-Poly-Beta-Proxy-Ts')?.trim();
    const sig = request.headers.get('X-Poly-Beta-Proxy-Sig')?.trim();
    const ts = tsRaw ? Number.parseInt(tsRaw, 10) : Number.NaN;
    if (
      forwardedIp &&
      tsRaw &&
      sig &&
      Number.isFinite(ts) &&
      Math.abs(nowMs - ts) <= PROXY_SIG_MAX_SKEW_MS
    ) {
      const expected = await hmacSha256Hex(secret, `${forwardedIp}:${tsRaw}`);
      if (timingSafeHexEqual(sig, expected)) {
        return forwardedIp;
      }
    }
  }
  return resolveClientIpKey(request, env);
}

export function isMutationSourcePermitted(request: Request, env: PolyBetaEnv): boolean {
  const secFetchSite = request.headers.get('Sec-Fetch-Site')?.trim().toLowerCase();
  if (secFetchSite === 'cross-site') {
    return false;
  }
  const origin = request.headers.get('Origin');
  if (!origin) {
    if (secFetchSite === 'same-site' || secFetchSite === 'none') {
      return false;
    }
    return env.ENVIRONMENT !== 'public-beta';
  }
  return isOriginPermitted(origin, env);
}

export async function readMarketNegativeCache(
  env: PolyBetaEnv,
  nowMs: number,
): Promise<string | null> {
  const raw = await env.POLY_BETA_KV.get(NEGATIVE_MARKET_CACHE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { failedAtMs?: number; reason?: string };
    if (
      typeof parsed.failedAtMs === 'number' &&
      nowMs >= parsed.failedAtMs &&
      nowMs - parsed.failedAtMs < NEGATIVE_BACKOFF_MS
    ) {
      return parsed.reason ?? 'Upstream market feed temporarily unavailable';
    }
  } catch {
    return null;
  }
  return null;
}

export async function writeMarketNegativeCache(
  env: PolyBetaEnv,
  reason: string,
  nowMs: number,
): Promise<void> {
  await env.POLY_BETA_KV.put(
    NEGATIVE_MARKET_CACHE_KEY,
    JSON.stringify({ failedAtMs: nowMs, reason }),
    { expirationTtl: 60 },
  );
}

const MAX_JSON_BODY_BYTES = 16_384;

/**
 * Enforce Content-Type: application/json, stream-cap payload at 16 KB,
 * and parse as JSON.  Returns either the parsed value or a fully-formed
 * 415 / 413 / 400 Response that the caller can return directly.
 */
export async function parseBoundedJsonBody(
  request: Request,
  env: PolyBetaEnv,
): Promise<{ body: unknown } | Response> {
  const ct = request.headers.get('Content-Type') ?? '';
  if (!ct.startsWith('application/json')) {
    return betaJsonResponse(request, env, { error: 'Content-Type must be application/json', code: 'UNSUPPORTED_MEDIA_TYPE' }, 415);
  }

  const reader = request.body?.getReader();
  if (!reader) {
    return betaJsonResponse(request, env, { error: 'Empty body', code: 'INVALID_PAYLOAD' }, 400);
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_JSON_BODY_BYTES) {
      await reader.cancel();
      return betaJsonResponse(request, env, { error: `Payload exceeds ${MAX_JSON_BODY_BYTES} bytes`, code: 'PAYLOAD_TOO_LARGE' }, 413);
    }
    chunks.push(value);
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) { merged.set(c, offset); offset += c.byteLength; }
  try {
    return { body: JSON.parse(new TextDecoder().decode(merged)) };
  } catch {
    return betaJsonResponse(request, env, { error: 'Invalid JSON body', code: 'INVALID_PAYLOAD' }, 400);
  }
}
