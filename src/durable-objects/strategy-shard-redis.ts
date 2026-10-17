/**
 * Durable Object state extraction & Redis connection helper.
 *
 * @module durable-objects/strategy-shard-redis
 */

import type { DurableObjectState } from '@cloudflare/workers-types';
import type { RedisClientType } from '../redis';
import { logger } from '../utils/logger';

/**
 * Extract shard ID from DO state.id using FNV-1a hash.
 * DO bindings don't expose binding name; use state.id for deterministic shard mapping.
 */
export function extractShardId(state: DurableObjectState): number {
  const id = state.id.toString();
  let hash = 2166136261 >>> 0; // FNV offset basis
  for (let i = 0; i < id.length; i++) {
    hash ^= id.charCodeAt(i);
    hash = ((hash << 1) + (hash >>> 31) + (hash << 4) + (hash >>> 27)) >>> 0; // FNV prime
  }
  return hash % 12;
}

/** Lazy Redis singleton for shard state — avoids loading ioredis at module scope */
let redisInstance: RedisClientType | null = null;
let redisInitPromise: Promise<RedisClientType | null> | null = null;

export async function getRedisClient(): Promise<RedisClientType | null> {
  if (redisInstance) return redisInstance;
  if (redisInitPromise) return redisInitPromise;

  redisInitPromise = (async (): Promise<RedisClientType | null> => {
    try {
      const mod = await import('../redis');
      redisInstance = mod.getRedisClient();
      return redisInstance;
    } catch (err) {
      logger.warn('[StrategyShard] Redis unavailable in WASM runtime', { error: String(err) });
      return null;
    }
  })();
  return redisInitPromise;
}
