/**
 * State management, persistence, and serialization for StrategyShard.
 * Extracted from strategy-shard.ts to keep the DO class under 200 lines.
 */

import type { DurableObjectState } from '@cloudflare/workers-types';
import type { RedisClientType } from '../redis';
import { logger } from '../utils/logger';
import { compressData, decompressData } from './shard-compression';
import type { IStrategy } from '../desk/strategies/types';
import { StrategyLoader } from '../desk/strategies/loader';
import { ShardManager } from './shard-manager';
import type { Env, ShardMetrics } from './strategy-shard-types';

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

/**
 * Get strategy assignments for this shard from Redis cache or DO storage.
 */
export async function getStrategyAssignments(
  shardId: number,
  storage: DurableObjectState['storage'],
): Promise<string[]> {
  const assignmentsKey = `shard:${shardId}:strategies`;
  const _r = await getRedisClient();
  if (_r) {
    const cached = await _r.smembers(assignmentsKey);
    if (cached.length > 0) {
      return cached;
    }
  }

  const stored = await storage.get<string[]>('assignedStrategies');
  if (stored) {
    return stored;
  }

  logger.warn('[StrategyShard] No strategy assignments found');
  return [];
}

/**
 * Restore metrics from DO storage (with optional decompression).
 */
export async function restoreMetrics(
  storage: DurableObjectState['storage'],
): Promise<ShardMetrics> {
  const defaultMetrics: ShardMetrics = {
    requests: 0,
    totalLatencyMs: 0,
    errors: 0,
    queueLength: 0,
    strategiesLoaded: 0,
    lastUpdated: 0,
  };

  try {
    const stored = await storage.get<{ data: string; compressed: boolean } | ShardMetrics>('metrics');
    if (!stored) return defaultMetrics;

    // New format: { data, compressed }
    if ('compressed' in stored && stored.compressed && stored.data) {
      const decompressed = await decompressData(stored.data);
      return JSON.parse(decompressed) as ShardMetrics;
    }
    if ('data' in stored && stored.data) {
      return JSON.parse(stored.data) as ShardMetrics;
    }
    // Legacy format: raw ShardMetrics object
    return (stored as unknown) as ShardMetrics;
  } catch (error) {
    logger.error('[StrategyShard] Failed to restore metrics:', error);
    return defaultMetrics;
  }
}

/**
 * Persist metrics to DO storage (with compression, fallback to uncompressed).
 */
export async function persistMetrics(
  storage: DurableObjectState['storage'],
  metrics: ShardMetrics,
): Promise<void> {
  metrics.lastUpdated = Date.now();

  try {
    const data = JSON.stringify(metrics);
    const compressed = await compressData(data);
    await storage.put('metrics', { data: compressed, compressed: true });
  } catch (error) {
    logger.error('[StrategyShard] Failed to persist metrics:', error);
    // Fallback: store uncompressed
    await storage.put('metrics', metrics);
  }
}

/**
 * Full shard initialization: load strategies, register health, restore metrics.
 * Called from StrategyShard constructor via fire-and-forget.
 */
export async function initializeShard(
  shardId: number,
  storage: DurableObjectState['storage'],
  env: Env | undefined,
  strategies: Map<string, IStrategy>,
): Promise<void> {
  try {
    const assignments = await getStrategyAssignments(shardId, storage);
    const loader = new StrategyLoader();

    for (const strategyId of assignments) {
      try {
        const strategy = await loader.loadStrategy(strategyId);
        if (strategy) {
          strategies.set(strategyId, (strategy as any as IStrategy));
          logger.info('[StrategyShard] Loaded strategy', { shardId, strategyId });
        }
      } catch (error) {
        logger.error('[StrategyShard] Failed to load strategy', { shardId, strategyId, error });
      }
    }

    // Register health with ShardManager (env may not be available at construction time)
    if (env) {
      const shardManager = env.SHARD_MANAGER as unknown as ShardManager;
      if (shardManager) {
        await shardManager.updateShardHealth(shardId, {
          shardId,
          lastHeartbeat: Date.now(),
          rps: 0,
          avgLatencyMs: 0,
          errorCount: 0,
          strategyCount: strategies.size,
          status: 'healthy' as const,
        });
      }
    }

    logger.info('[StrategyShard] Initialized', { shardId, strategies: strategies.size });
  } catch (error) {
    logger.error('[StrategyShard] Initialization failed:', error);
    throw error;
  }
}

/**
 * Persist shard health to Redis.
 */
export async function persistHealth(
  shardId: number,
  health: Record<string, unknown>,
): Promise<void> {
  const _r = await getRedisClient();
  if (_r) {
    await _r.hset('shard:health', shardId.toString(), JSON.stringify(health));
  }
}
