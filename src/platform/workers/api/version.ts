/**
 * /api/version — returns deployed commit SHA and optional source tree hash.
 * Prefers runtime secret `COMMIT_SHA`, falling back to build-time `BUILD_COMMIT_SHA`.
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
  BUILD_COMMIT_SHA?: string;
  SRC_TREE_HASH?: string;
};

export function handleVersion(env: Env): Response {
  const envCommitSha = (env.COMMIT_SHA ?? '').trim();
  const buildCommitSha = (env.BUILD_COMMIT_SHA ?? process.env.BUILD_COMMIT_SHA ?? '').trim();
  const sha = envCommitSha || buildCommitSha || 'unknown';
  const shortSha = sha !== 'unknown' && sha.length >= 8 ? sha.slice(0, 8) : sha;
  const srcTreeHash = (env.SRC_TREE_HASH ?? process.env.SRC_TREE_HASH ?? '').trim() || null;
  const provenanceSource: 'env_secret' | 'build_embedded' | 'unknown' = envCommitSha
    ? 'env_secret'
    : buildCommitSha
      ? 'build_embedded'
      : 'unknown';
  return new Response(
    JSON.stringify({
      sha,
      shortSha,
      ...(srcTreeHash ? { srcTreeHash } : {}),
      provenanceSource,
      service: 'algo-trader',
      arch: 'cf-only',
    }),
    { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
  );
}
