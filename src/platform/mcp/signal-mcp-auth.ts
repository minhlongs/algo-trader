/**
 * Auth, identity resolution, URI parsing, and signal fetch helpers for Signal MCP Server.
 */

import { resolveSubscriberId } from '../middleware/signal-tier-resolver';
import { getCachedSignals } from '../../desk/signal/signal-rest-cache';
import { logger } from '../../shared/utils/logger';
import {
  type TierKey,
  type Signal,
  type ResourceQuery,
  TIER_RANK,
} from './signal-mcp-types';

/** Validate an API key returns a usable subscriber identity. */
export function resolveIdentity(apiKey: string): { subscriberId: string; tier: TierKey } | null {
  // Build a synthetic Express Request-like object for resolveSubscriberId
  const mockReq = {
    headers: { authorization: `Bearer ${apiKey}` },
  } as unknown as Parameters<typeof resolveSubscriberId>[0];

  const identity = resolveSubscriberId(mockReq);
  if (!identity) return null;
  // Only signal tiers are eligible
  if (TIER_RANK[identity.tier] === undefined) return null;
  return identity;
}

/** Enforce minimum tier — accepted tier keys only. */
export function hasMinimumTier(tier: TierKey, minimum: TierKey): boolean {
  return (TIER_RANK[tier] ?? 0) >= (TIER_RANK[minimum] ?? 0);
}

/** Parse resource URI into structured query parameters. */
export function parseResourceUri(uri: string): ResourceQuery | null {
  try {
    const match = uri.match(/^signal:\/\/feed\/([A-Z]+)\?(.+)$/);
    if (!match) return null;
    const apiKey = extractApiKeyFromResource(match[2]);
    const tier = match[1] as TierKey;
    const since = extractIntParam(match[2], 'since', 0);
    const limit = extractIntParam(match[2], 'limit', 20);
    if (!apiKey || TIER_RANK[tier] === undefined) return null;
    return { apiKey, tier, since, limit: Math.min(Math.max(limit, 1), 100) };
  } catch {
    return null;
  }
}

export function extractApiKeyFromResource(query: string): string | null {
  const m = query.match(/apiKey=([^&]+)/);
  if (m) return decodeURIComponent(m[1]);
  return null;
}

export function extractIntParam(query: string, key: string, fallback: number): number {
  const m = query.match(new RegExp(`${key}=(\\d+)`));
  return m ? parseInt(m[1], 10) : fallback;
}

export function buildResourceError(message: string) {
  return {
    contents: [
      {
        uri: 'signal://feed/error',
        mimeType: 'application/json',
        text: JSON.stringify({ error: message }),
      },
    ],
  };
}

/** Fetch signals with cache-first, tier-filter fallback. */
export async function fetchSignals(tier: TierKey, since: number, limit: number): Promise<Signal[]> {
  try {
    const cached = await getCachedSignals(tier, since, limit);
    if (cached && cached.length > 0) {
      return cached;
    }
    logger.debug('[MCP] Signal cache miss, returning empty result');
    return [];
  } catch (err) {
    logger.warn('[MCP] fetchSignals failed', { err });
    return [];
  }
}
