/**
 * Signal REST Cache
 * KV-backed (Redis) cache layer for paginated REST responses.
 * Keyed by tier to avoid serving wrong signals across tiers.
 */

import { getRedisClient } from '../../redis';
import { logger } from '../../shared/utils/logger';
import type { Signal, TierKey } from './signal-types';

const CACHE_TTL_SEC = 10; // short TTL — signals are time-sensitive
const KEY_PREFIX = 'signal:rest:';

function cacheKey(tier: TierKey, since: number, limit: number): string {
  return `${KEY_PREFIX}${tier}:${since}:${limit}`;
}

/** Write signals for a tier+query combo to Redis */
export async function setCachedSignals(
  tier: TierKey,
  since: number,
  limit: number,
  signals: Signal[]
): Promise<void> {
  try {
    const redis = getRedisClient();
    const key = cacheKey(tier, since, limit);
    await redis.setex(key, CACHE_TTL_SEC, JSON.stringify(signals));
  } catch (err) {
    logger.warn('[SignalCache] Redis write failed', { err });
  }
}

/** Read cached signals; returns null on miss or error */
export async function getCachedSignals(
  tier: TierKey,
  since: number,
  limit: number
): Promise<Signal[] | null> {
  try {
    const redis = getRedisClient();
    const key = cacheKey(tier, since, limit);
    const raw = await redis.get(key);
    if (!raw) return null;
    return JSON.parse(raw) as Signal[];
  } catch (err) {
    logger.warn('[SignalCache] Redis read failed', { err });
    return null;
  }
}

/** Invalidate all cached signal pages (call after publishing new signal) */
export async function invalidateSignalCache(): Promise<void> {
  try {
    const redis = getRedisClient();
    const keys = await redis.keys(`${KEY_PREFIX}*`);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  } catch (err) {
    logger.warn('[SignalCache] Invalidation failed', { err });
  }
}
