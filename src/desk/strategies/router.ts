/**
 * Strategy Router
 * Routes strategy execution requests to appropriate shard Durable Objects
 * Uses consistent hashing for deterministic shard assignment
 */

import { getRedisClient, type RedisClientType } from '../../redis';
import { logger } from '../../shared/utils/logger';
import { hashString } from '../../shared/utils/consistent-hash';
import type { IStrategy } from './types';
import { recordShardLatency } from '../../middleware/prometheus-metrics';

// Configuration
const TOTAL_SHARDS = 12;
const SHARD_BINDING_PREFIX = 'SHARD_';

// Fallback shard assignment cache (for edge routing without DO manager)
const SHARD_ASSIGNMENT_CACHE = new Map<string, number>();
const SHARD_CACHE_TTL_MS = 60 * 1000;
const SHARD_CACHE_TIMESTAMPS = new Map<string, number>();

// Minimal interface for DO stub
interface DurableObjectStub {
  fetch(input: RequestInfo, init?: RequestInit): Promise<Response>;
}

/**
 * Simple modulo-based assignment for edge routing
 * Used when ShardManager DO is not accessible
 */
function assignShardByModulo(strategyId: string): number {
  const hash = hashString(strategyId);
  return hash % TOTAL_SHARDS;
}

/**
 * Get shard binding name from shard ID
 */
export function getShardBindingName(shardId: number): string {
  return `${SHARD_BINDING_PREFIX}${shardId}`;
}

/**
 * Get shard ID from strategy ID using consistent hashing
 * This is the deterministic assignment function: strategyId % 12 with consistent hashing
 */
export function getShardId(strategyId: string): number {
  // Check cache first
  const cached = SHARD_ASSIGNMENT_CACHE.get(strategyId);
  const cachedAt = SHARD_CACHE_TIMESTAMPS.get(strategyId);
  if (cached !== undefined && cachedAt && Date.now() - cachedAt < SHARD_CACHE_TTL_MS) {
    return cached;
  }

  // Compute assignment
  const shardId = assignShardByModulo(strategyId);

  // Cache result
  SHARD_ASSIGNMENT_CACHE.set(strategyId, shardId);
  SHARD_CACHE_TIMESTAMPS.set(strategyId, Date.now());

  return shardId;
}

/**
 * Invalidate shard assignment cache (for rebalancing)
 */
export function invalidateShardCache(): void {
  SHARD_ASSIGNMENT_CACHE.clear();
  SHARD_CACHE_TIMESTAMPS.clear();
}

/**
 * Clear expired cache entries
 */
export function pruneShardCache(): void {
  const now = Date.now();
  for (const [key, timestamp] of SHARD_CACHE_TIMESTAMPS.entries()) {
    if (now - timestamp > SHARD_CACHE_TTL_MS) {
      SHARD_ASSIGNMENT_CACHE.delete(key);
      SHARD_CACHE_TIMESTAMPS.delete(key);
    }
  }
}

/**
 * Strategy Router class
 * Handles routing strategy execution to correct shard DO
 */
export class StrategyRouter {
  private redis: RedisClientType;
  private env: any; // Durable Object environment

  constructor(env?: any) {
    this.redis = getRedisClient();
    this.env = env;
  }

  /**
   * Route strategy execution to appropriate shard
   */
  async executeStrategy(
    strategyId: string,
    marketData: Record<string, unknown>,
    options?: { timeoutMs?: number }
  ): Promise<{
    success: boolean;
  signal?: 'BUY' | 'SELL' | 'HOLD';
  confidence?: number;
    shardId: number;
    latencyMs: number;
    error?: string;
  }> {
    const shardId = getShardId(strategyId);
    const bindingName = getShardBindingName(shardId);

    const startTime = Date.now();

    try {
      // Get shard DO stub from environment bindings
      const shardStub = this.getShardStub(shardId, bindingName);
      if (!shardStub) {
        throw new Error(`Shard DO binding not found: ${bindingName}`);
      }

      // Fetch from shard DO
      const url = new URL('/execute', 'http://shard.local');
      url.searchParams.set('strategyId', strategyId);

      const response = await shardStub.fetch(url.toString(), {
        method: 'POST',
        body: JSON.stringify({
          strategyId,
          marketData,
        }),
      });

      const latencyMs = Date.now() - startTime;
      // Record shard latency for monitoring
      recordShardLatency(String(shardId), 'execute', latencyMs / 1000);

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({ error: 'Unknown error' })) as { error?: string };
        return {
          success: false,
          shardId,
          latencyMs,
          error: errorBody.error || `HTTP ${response.status}`,
        };
      }

      const result = await response.json() as {
        signal: 'BUY' | 'SELL' | 'HOLD';
        confidence: number;
        metadata?: Record<string, unknown>;
      };

      return {
        success: true,
  signal: result.signal,
  confidence: result.confidence,
        shardId,
        latencyMs,
      };
    } catch (error) {
      const latencyMs = Date.now() - startTime;
      // Record shard latency even on error
      recordShardLatency(String(shardId), 'execute', latencyMs / 1000);

      logger.error('[StrategyRouter] Execution failed', {
        strategyId,
        shardId,
        error: String(error),
      });

      return {
        success: false,
        shardId,
        latencyMs,
        error: String(error),
  signal: 'HOLD',
  confidence: 0,
 };
    }
  }

  /**
   * Get shard DO stub from environment bindings
   */
  private getShardStub(shardId: number, bindingName: string): DurableObjectStub | null {
    if (!this.env) {
      logger.warn('[StrategyRouter] No environment bindings available');
      return null;
    }

    // Check if binding exists in env
    const binding = this.env[bindingName];
    if (binding) {
      return binding as DurableObjectStub;
    }

    logger.warn('[StrategyRouter] Shard binding not found', { bindingName, shardId });
    return null;
  }

  /**
   * Get health status for all shards
   */
  async getShardHealth(): Promise<
    Array<{ shardId: number; status: string; strategies: string[] }>
  > {
    const healthStatuses: Array<{ shardId: number; status: string; strategies: string[] }> = [];

    for (let shardId = 0; shardId < TOTAL_SHARDS; shardId++) {
      const bindingName = getShardBindingName(shardId);
      const stub = this.getShardStub(shardId, bindingName);

      if (stub) {
        try {
          const url = new URL('/health', 'http://shard.local');
          const response = await stub.fetch(url.toString());
          if (response.ok) {
            const health = await response.json() as { status: string; strategiesLoaded: number };
            healthStatuses.push({
              shardId,
              status: health.status,
              strategies: [], // Would need /info endpoint for full list
            });
          } else {
            healthStatuses.push({
              shardId,
              status: 'unreachable',
              strategies: [],
            });
          }
        } catch (error) {
          healthStatuses.push({
            shardId,
            status: 'error',
            strategies: [],
          });
        }
      } else {
        healthStatuses.push({
          shardId,
          status: 'unbound',
          strategies: [],
        });
      }
    }

    return healthStatuses;
  }

  /**
   * Get shard ID for a strategy (static method for simple lookups)
   */
  static getShardId(strategyId: string): number {
    return getShardId(strategyId);
  }

  /**
   * Get distribution of strategies across shards
   */
  async getDistribution(strategyIds: string[]): Promise<Map<number, number>> {
    const distribution = new Map<number, number>();

    // Initialize all shards
    for (let i = 0; i < TOTAL_SHARDS; i++) {
      distribution.set(i, 0);
    }

    // Count strategies per shard
    for (const strategyId of strategyIds) {
      const shardId = getShardId(strategyId);
      distribution.set(shardId, distribution.get(shardId)! + 1);
    }

    return distribution;
  }
}

// Singleton instance
let routerInstance: StrategyRouter | null = null;

export function getStrategyRouter(env?: any): StrategyRouter {
  if (!routerInstance) {
    routerInstance = new StrategyRouter(env);
  }
  return routerInstance;
}
