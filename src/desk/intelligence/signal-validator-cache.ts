/**
 * Signal Validator — semantic cache (Redis-backed + local memory fallback).
 * Split from signal-validator.ts (S16 tranche 3).
 */

import { logger } from '../utils/logger';
import { getRedisClient } from '../redis/index';
import type { SignalCandidate, UnifiedValidationResult } from './signal-validator-types';

export const SEMANTIC_CACHE_TTL = 300; // 5 minutes cache for similar market state
export const localMemoryCache = new Map<string, { value: UnifiedValidationResult; expires: number }>();

/** Generates semantic cache key based on rounded prices (1 cent bins) */
export function getSemanticCacheKey(signal: SignalCandidate): string {
  const marketPart = signal.markets
    .map(m => `${m.id}_${m.yesPrice.toFixed(2)}_${m.noPrice.toFixed(2)}`)
    .sort()
    .join('|');
  return `semantic-cache:signal:${signal.signalType}:${marketPart}`;
}

export async function getCachedValidation(signal: SignalCandidate): Promise<UnifiedValidationResult | null> {
  const key = getSemanticCacheKey(signal);

  // Try Redis first
  try {
    const redis = getRedisClient();
    const cached = await redis.get(key);
    if (cached) {
      logger.info(`[SignalValidator] Semantic cache HIT (Redis): ${key}`);
      return JSON.parse(cached) as UnifiedValidationResult;
    }
  } catch (err) {
    logger.debug('[SignalValidator] Redis semantic cache read failed, trying local memory cache', { err });
  }

  // Try local memory fallback
  const localVal = localMemoryCache.get(key);
  if (localVal && localVal.expires > Date.now()) {
    logger.info(`[SignalValidator] Semantic cache HIT (Memory): ${key}`);
    return localVal.value;
  } else if (localVal) {
    localMemoryCache.delete(key);
  }

  return null;
}

export async function cacheValidation(signal: SignalCandidate, result: UnifiedValidationResult): Promise<void> {
  const key = getSemanticCacheKey(signal);

  // Write to Redis
  try {
    const redis = getRedisClient();
    await redis.setex(key, SEMANTIC_CACHE_TTL, JSON.stringify(result));
  } catch (err) {
    logger.debug('[SignalValidator] Redis semantic cache write failed', { err });
  }

  // Write to local memory
  localMemoryCache.set(key, {
    value: result,
    expires: Date.now() + SEMANTIC_CACHE_TTL * 1000,
  });

  // Prune local cache to prevent unbounded memory growth (max 1000 items)
  if (localMemoryCache.size > 1000) {
    const now = Date.now();
    // First, prune expired items
    for (const [k, val] of localMemoryCache.entries()) {
      if (val.expires <= now) {
        localMemoryCache.delete(k);
      }
    }
    // If still over the limit, prune the oldest entries (Map preserves insertion order)
    if (localMemoryCache.size > 1000) {
      for (const k of localMemoryCache.keys()) {
        localMemoryCache.delete(k);
        if (localMemoryCache.size <= 1000) {
          break;
        }
      }
    }
  }
}
