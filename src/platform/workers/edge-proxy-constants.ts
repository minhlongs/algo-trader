/**
 * Shared constants for the edge-proxy worker.
 * Region definitions, CORS headers, and cache TTL.
 */

/**
 * Region routing configuration.
 *
 * `host` is the one deployed origin: the per-region
 * `<region>.algo-trader.workers.dev` hostnames do not resolve, so probing them
 * reported every region unhealthy. The entries stay keyed by region so the
 * routing type (`RegionId`) and priority ordering are unchanged; only the host
 * they point at is corrected.
 */
export const REGIONS = {
  'us-east': { id: 'us-east', host: 'api.cashclaw.cc', priority: 1 },
  'eu-central': { id: 'eu-central', host: 'api.cashclaw.cc', priority: 2 },
  'ap-southeast': { id: 'ap-southeast', host: 'api.cashclaw.cc', priority: 3 },
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
