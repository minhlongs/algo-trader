/**
 * Shard Manager Durable Object
 * Manages consistent hash ring and shard assignments for strategy execution
 *
 * Performance target: <5ms shard lookup latency
 * Architecture: 12 shards with 100 virtual nodes each
 */

import type { RedisClientType } from '../redis';
import type { DurableObjectState } from '@cloudflare/workers-types';
import { logger } from '../shared/utils/logger';
import {
  buildRing, getShardForStrategy, serializeRing, deserializeRing, type HashRing,
} from '../desk/utils/consistent-hash';
import { TOTAL_SHARDS, VIRTUAL_NODES_PER_SHARD } from './shard-manager-types';
import type { Env, ShardHealth, ShardMetrics, RingStateResponse } from './shard-manager-types';
import {
  computeRingState, rebuildRing, collectRingMetrics, createDefaultShardHealth,
} from './shard-manager-routing';
import {
  handleAdminRequest, handleHealthCheck, handleMetrics, isAdminAuth,
} from './shard-manager-handlers';

// Re-export all public symbols for backward compatibility.
export { TOTAL_SHARDS, VIRTUAL_NODES_PER_SHARD } from './shard-manager-types';
export type { Env, ShardHealth, ShardMetrics, RingStateResponse } from './shard-manager-types';
export {
  getShardAssignment, computeRingState, rebuildRing, collectRingMetrics,
  createDefaultShardHealth, fetchAllStrategyIds,
} from './shard-manager-routing';
export {
  handleAdminRequest, handleHealthCheck, handleMetrics, isAdminAuth,
} from './shard-manager-handlers';

/**
 * Durable Object that owns the consistent hash ring and exposes
 * routing, health, and rebalance endpoints via a single fetch handler.
 */
export class ShardManager {
  private currentEnv?: Env;
  private state: DurableObjectState;
  private redis: RedisClientType | null = null;
  private redisInitPromise: Promise<RedisClientType | null> | null = null;
  private ring: HashRing | null = null;
  private shardHealths: Map<number, ShardHealth> = new Map();
  private shardMetrics: Map<number, ShardMetrics> = new Map();

  constructor(state: DurableObjectState) {
    this.state = state;
    this.currentEnv = (state as any).env;
    this.redisInitPromise = null;
    this.initializeRing().catch(error => logger.error('[ShardManager] Init failed:', error));
  }

  private async getRedis(): Promise<RedisClientType | null> {
    if (this.redis) return this.redis;
    if (this.redisInitPromise) return this.redisInitPromise;
    this.redisInitPromise = (async (): Promise<RedisClientType | null> => {
      try {
        const mod = await import('../redis');
        this.redis = mod.getRedisClient();
        return this.redis;
      } catch (err) {
        logger.warn('[ShardManager] Redis unavailable in WASM runtime', { error: String(err) });
        return null;
      }
    })();
    return this.redisInitPromise;
  }

  private async initializeRing(): Promise<void> {
    try {
      const stored = await this.state.storage.get<{ ring: string }>('ring');
      if (stored?.ring) {
        this.ring = deserializeRing(stored.ring);
        logger.info('[ShardManager] Ring loaded', { shards: this.ring.ring.size / VIRTUAL_NODES_PER_SHARD });
      } else {
        this.ring = buildRing(TOTAL_SHARDS, VIRTUAL_NODES_PER_SHARD);
        await this.persistRing();
        logger.info('[ShardManager] New ring created', { totalShards: TOTAL_SHARDS });
      }
      const healths = await this.state.storage.get<Map<number, ShardHealth>>('shardHealths');
      if (healths) this.shardHealths = healths;
      const metrics = await this.state.storage.get<Map<number, ShardMetrics>>('shardMetrics');
      if (metrics) this.shardMetrics = metrics;
    } catch (error) {
      logger.error('[ShardManager] Failed to initialize ring:', error);
      throw error;
    }
  }

  private async persistRing(): Promise<void> {
    if (this.ring) await this.state.storage.put('ring', { ring: serializeRing(this.ring) });
  }

  async fetch(request: Request): Promise<Response> {
    this.currentEnv = (this.state as any).env as Env;
    const url = new URL(request.url);
    const path = url.pathname;

    if (path.startsWith('/admin')) {
      if (!isAdminAuth(request, this.currentEnv as { ADMIN_API_KEY?: string })) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
      }
      return handleAdminRequest(request, {
        storage: this.state.storage,
        shardHealth: this.shardHealths,
        shardMetrics: this.shardMetrics,
      }, {
        getRingState: () => this.getRingState(),
        rebalance: () => this.rebalance(),
        updateShardHealth: (id: number, h: Partial<ShardHealth>) => {
          this.updateShardHealth(id, h);
          return Promise.resolve();
        },
      });
    }
    if (path === '/health') return handleHealthCheck(this.getRingState(), this.shardHealths);
    if (path === '/shard/metrics') return handleMetrics(this.shardMetrics);

    const strategyId = url.searchParams.get('strategyId');
    if (!strategyId) return Response.json({ error: 'strategyId query parameter required' }, { status: 400 });
    try {
      const shardId = this.getShardForStrategy(strategyId);
      return Response.json({ shardId, shardBinding: `SHARD_${shardId}`, strategyId, message: 'Route to appropriate StrategyShard DO' });
    } catch (error) {
      logger.error('[ShardManager] Routing error:', { error, strategyId });
      return Response.json({ error: 'Failed to route strategy' }, { status: 500 });
    }
  }

  getShardForStrategy(strategyId: string): number {
    if (!this.ring) throw new Error('Hash ring not initialized');
    return getShardForStrategy(this.ring, strategyId);
  }

  getRingState(): RingStateResponse {
    if (!this.ring) throw new Error('Ring not initialized');
    const state = computeRingState(this.ring, []);
    return { ...state, totalShards: TOTAL_SHARDS, virtualNodesPerShard: VIRTUAL_NODES_PER_SHARD };
  }

  async rebalance(): Promise<{ previous: Map<number, number>; updated: Map<number, number> }> {
    if (!this.ring) throw new Error('Ring not initialized');
    const previous = new Map<number, number>();
    this.ring = rebuildRing();
    await this.persistRing();
    const updated = new Map<number, number>();
    return { previous, updated };
  }

  updateShardHealth(shardId: number, health: Partial<ShardHealth>): void {
    const existing = this.shardHealths.get(shardId) ?? createDefaultShardHealth(shardId);
    this.shardHealths.set(shardId, { ...existing, ...health, lastHeartbeat: Date.now() });
  }

  getShardHealths(): ShardHealth[] { return Array.from(this.shardHealths.values()); }

  recordMetrics(shardId: number, latencyMs: number, success: boolean): void {
    let m = this.shardMetrics.get(shardId);
    if (!m) { m = { requests: 0, errors: 0, totalLatencyMs: 0, lastUpdated: Date.now() }; this.shardMetrics.set(shardId, m); }
    m.requests++; m.totalLatencyMs += latencyMs; if (!success) m.errors++; m.lastUpdated = Date.now();
  }

  async alarm(): Promise<void> {
    try {
      for (const [shardId, metrics] of this.shardMetrics.entries()) {
        const avgLatency = metrics.requests > 0 ? metrics.totalLatencyMs / metrics.requests : 0;
        this.updateShardHealth(shardId, { rps: metrics.requests / 10, avgLatencyMs: avgLatency });
        metrics.requests = 0; metrics.errors = 0; metrics.totalLatencyMs = 0;
      }
      await this.state.storage.put('shardHealths', this.shardHealths);
      await this.state.storage.put('shardMetrics', this.shardMetrics);
    } catch (error) { logger.error('[ShardManager] Alarm failed:', error); }
  }
}
