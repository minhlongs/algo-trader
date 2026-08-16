/**
 * Shared constants for the edge-proxy worker.
 * Region definitions, CORS headers, and cache TTL.
 */

/** Region routing configuration */
export const REGIONS = {
  'us-east': { id: 'us-east', host: 'us-east.algo-trader.workers.dev', priority: 1 },
  'eu-central': { id: 'eu-central', host: 'eu.algo-trader.workers.dev', priority: 2 },
  'ap-southeast': { id: 'ap-southeast', host: 'asia.algo-trader.workers.dev', priority: 3 },
} as const;

/** Region identifier derived from REGIONS keys */
export type RegionId = keyof typeof REGIONS;

/** CORS response headers */
export const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': 'https://cashclaw.cc',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Content-Type': 'application/json',
};

/** Security headers applied to all API responses (HSTS + CSP) */
export const SECURITY_HEADERS: Record<string, string> = {
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
};

/** Default cache TTL in seconds */
export const CACHE_TTL = 60;

/**
 * Reserved: dynamic origin validation for multi-tenant CORS.
 * Currently unused — kept for future per-tenant CORS resolution.
 */
export function _getCorsOrigin(env: { ALLOWED_ORIGINS?: string }, origin?: string | null): string {
  const allowed = (env.ALLOWED_ORIGINS || 'https://cashclaw.cc').split(',').map((s: string) => s.trim());
  return origin && allowed.includes(origin) ? origin : allowed[0];
}
