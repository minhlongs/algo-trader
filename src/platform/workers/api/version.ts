/**
 * /api/version — returns deployed commit SHA.
 * COMMIT_SHA injected at deploy time via `wrangler secret put COMMIT_SHA`
 */

import type { D1Database, KVNamespace } from '@cloudflare/workers-types';

type Env = {
  CACHE: KVNamespace;
  SUBSCRIBERS?: D1Database;
  JWT_SECRET?: string;
  ALLOWED_ORIGINS?: string;
  NOWPAYMENTS_IPN_SECRET?: string;
  ENVIRONMENT?: string;
  VPS_ORIGIN?: string;
  REGION_ROUTING_ENABLED?: string;
  COMMIT_SHA?: string;
};

export function handleVersion(env: Env): Response {
  const sha = env.COMMIT_SHA ?? 'unknown';
  const shortSha = sha.length >= 8 ? sha.slice(0, 8) : sha;
  return new Response(
    JSON.stringify({ sha, shortSha, service: 'algo-trader', arch: 'cf-only' }),
    { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
  );
}
