/**
 * Strategy Router — StrategyRouter Class & Singleton
 *
 * Routes strategy execution requests to appropriate shard Durable Objects
 * using consistent hashing for deterministic shard assignment.
 *
 * Extracted from router.ts to keep files under 200 lines.
 * Re-exported via router.ts facade.
 */

import { getRedisClient, type RedisClientType } from '../../redis';
import { logger } from '../../shared/utils/logger';
import { recordShardLatency } from '../../middleware/prometheus-metrics';
import { getShardId, getShardBindingName, TOTAL_SHARDS } from './router-cache';

interface DurableObjectStub {
  fetch(input: RequestInfo, init?: RequestInit): Promise<Response>;
}

interface StrategyRouterEnv {
  [key: string]: unknown;
  [key: `SHARD_${number}`]: DurableObjectNamespace | undefined;
}

export class StrategyRouter {
  private redis: RedisClientType;
  private env: StrategyRouterEnv | undefined;

  constructor(env?: StrategyRouterEnv) {
    this.redis = getRedisClient();
    this.env = env;
  }

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
      const shardStub = this.getShardStub(shardId, bindingName);
      if (!shardStub) throw new Error(`Shard DO binding not found: ${bindingName}`);

      const url = new URL('/execute', 'http://shard.local');
      url.searchParams.set('strategyId', strategyId);

      const response = await shardStub.fetch(url.toString(), {
        method: 'POST',
        body: JSON.stringify({ strategyId, marketData }),
      });

      const latencyMs = Date.now() - startTime;
      recordShardLatency(String(shardId), 'execute', latencyMs / 1000);

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({ error: 'Unknown error' })) as { error?: string };
        return { success: false, shardId, latencyMs, error: errorBody.error || `HTTP ${response.status}` };
      }

      const result = await response.json() as { signal: 'BUY' | 'SELL' | 'HOLD'; confidence: number; metadata?: Record<string, unknown> };
      return { success: true, signal: result.signal, confidence: result.confidence, shardId, latencyMs };
    } catch (error) {
      const latencyMs = Date.now() - startTime;
      recordShardLatency(String(shardId), 'execute', latencyMs / 1000);
      logger.error('[StrategyRouter] Execution failed', { strategyId, shardId, error: String(error) });
      return { success: false, shardId, latencyMs, error: String(error), signal: 'HOLD', confidence: 0 };
    }
  }

  private getShardStub(shardId: number, bindingName: string): DurableObjectStub | null {
    if (!this.env) { logger.warn('[StrategyRouter] No environment bindings available'); return null; }
    const binding = this.env[bindingName];
    if (binding) return binding as DurableObjectStub;
    logger.warn('[StrategyRouter] Shard binding not found', { bindingName, shardId });
    return null;
  }

  async getShardHealth(): Promise<Array<{ shardId: number; status: string; strategies: string[] }>> {
    const healthStatuses: Array<{ shardId: number; status: string; strategies: string[] }> = [];
    for (let shardId = 0; shardId < TOTAL_SHARDS; shardId++) {
      const stub = this.getShardStub(shardId, getShardBindingName(shardId));
      if (stub) {
        try {
          const response = await stub.fetch(new URL('/health', 'http://shard.local').toString());
          if (response.ok) {
            const health = await response.json() as { status: string; strategiesLoaded: number };
            healthStatuses.push({ shardId, status: health.status, strategies: [] });
          } else {
            healthStatuses.push({ shardId, status: 'unreachable', strategies: [] });
          }
        } catch {
          healthStatuses.push({ shardId, status: 'error', strategies: [] });
        }
      } else {
        healthStatuses.push({ shardId, status: 'unbound', strategies: [] });
      }
    }
    return healthStatuses;
  }

  static getShardId(strategyId: string): number { return getShardId(strategyId); }

  async getDistribution(strategyIds: string[]): Promise<Map<number, number>> {
    const distribution = new Map<number, number>();
    for (let i = 0; i < TOTAL_SHARDS; i++) distribution.set(i, 0);
    for (const strategyId of strategyIds) {
      const shardId = getShardId(strategyId);
      distribution.set(shardId, distribution.get(shardId)! + 1);
    }
    return distribution;
  }
}

let routerInstance: StrategyRouter | null = null;

export function getStrategyRouter(env?: StrategyRouterEnv): StrategyRouter {
  if (!routerInstance) routerInstance = new StrategyRouter(env);
  return routerInstance;
}
