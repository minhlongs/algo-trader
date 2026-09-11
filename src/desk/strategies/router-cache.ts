/**
 * Strategy Router — Shard Cache & Hash Utilities
 *
 * Consistent-hash shard assignment with TTL-based cache invalidation.
 * Extracted from router.ts to keep files under 200 lines.
 * Re-exported via router.ts facade.
 */

import { hashString } from '../../shared/utils/consistent-hash';

const TOTAL_SHARDS = 12;
const SHARD_BINDING_PREFIX = 'SHARD_';
const SHARD_CACHE_TTL_MS = 60 * 1000;

const SHARD_ASSIGNMENT_CACHE = new Map<string, number>();
const SHARD_CACHE_TIMESTAMPS = new Map<string, number>();

function assignShardByModulo(strategyId: string): number {
  return hashString(strategyId) % TOTAL_SHARDS;
}

export function getShardBindingName(shardId: number): string {
  return `${SHARD_BINDING_PREFIX}${shardId}`;
}

export function getShardId(strategyId: string): number {
  const cached = SHARD_ASSIGNMENT_CACHE.get(strategyId);
  const cachedAt = SHARD_CACHE_TIMESTAMPS.get(strategyId);
  if (cached !== undefined && cachedAt && Date.now() - cachedAt < SHARD_CACHE_TTL_MS) {
    return cached;
  }
  const shardId = assignShardByModulo(strategyId);
  SHARD_ASSIGNMENT_CACHE.set(strategyId, shardId);
  SHARD_CACHE_TIMESTAMPS.set(strategyId, Date.now());
  return shardId;
}

export function invalidateShardCache(): void {
  SHARD_ASSIGNMENT_CACHE.clear();
  SHARD_CACHE_TIMESTAMPS.clear();
}

export function pruneShardCache(): void {
  const now = Date.now();
  for (const [key, timestamp] of SHARD_CACHE_TIMESTAMPS.entries()) {
    if (now - timestamp > SHARD_CACHE_TTL_MS) {
      SHARD_ASSIGNMENT_CACHE.delete(key);
      SHARD_CACHE_TIMESTAMPS.delete(key);
    }
  }
}

export { TOTAL_SHARDS };
