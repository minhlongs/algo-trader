/**
 * Shard Manager Durable Object
 * Manages consistent hash ring and shard assignments for strategy execution
 *
 * Performance target: <5ms shard lookup latency
 * Architecture: 12 shards with 100 virtual nodes each
 */

import { DurableObject, DurableObjectState } from '@cloudflare/workers-types';
import { getRedisClient, type RedisClientType } from '../redis';
import { logger } from '../utils/logger';
import {
  buildRing,
  getShardForStrategy,
  getDistribution,
  isBalanced,
  serializeRing,
  deserializeRing,
  type HashRing,
} from '../utils/consistent-hash';

export interface ShardHealth {
  shardId: number;
  lastHeartbeat: number;
  rps: number;
  avgLatencyMs: number;
  errorCount: number;
  strategyCount: number;
  status: 'healthy' | 'degraded' | 'offline';
}

export interface ShardMetrics {
  requests: number;
  errors: number;
  totalLatencyMs: number;
  lastUpdated: number;
}

export class ShardManager implements DurableObject {
  private state: DurableObjectState;
  private redis: RedisClientType;

  // Ring configuration
  private readonly TOTAL_SHARDS = 12;
  private readonly VIRTUAL_NODES_PER_SHARD = 100;

  // In-memory caches (state persisted to DO storage)
  private ring: HashRing | null = null;
  private shardHealths: Map<number, ShardHealth> = new Map();
  private shardMetrics: Map<number, ShardMetrics> = new Map();

  constructor(state: DurableObjectState) {
    this.state = state;
    this.redis = getRedisClient();
    this.initializeRing().catch(error => {
      logger.error('[ShardManager] Init failed:', error);
    });
  }

  /**
   * Initialize or load hash ring from storage
   */
  private async initializeRing(): Promise<void> {
    try {
      const stored = await this.state.storage.get<{ ring: string }>('ring');
      if (stored?.ring) {
        this.ring = deserializeRing(stored.ring);
        logger.info('[ShardManager] Ring loaded from storage', {
          shards: this.ring.ring.size / this.VIRTUAL_NODES_PER_SHARD,
        });
      } else {
        // Create new ring
        this.ring = buildRing(this.TOTAL_SHARDS, this.VIRTUAL_NODES_PER_SHARD);
        await this.persistRing();
        logger.info('[ShardManager] New ring created', {
          totalShards: this.TOTAL_SHARDS,
          virtualNodes: this.VIRTUAL_NODES_PER_SHARD,
        });
      }

      // Load shard health state
      const healths = await this.state.storage.get<Map<number, ShardHealth>>('shardHealths');
      if (healths) {
        this.shardHealths = healths;
      }

      // Load metrics
      const metrics = await this.state.storage.get<Map<number, ShardMetrics>>('shardMetrics');
      if (metrics) {
        this.shardMetrics = metrics;
      }
    } catch (error) {
      logger.error('[ShardManager] Failed to initialize ring:', error);
      throw error;
    }
  }

  /**
   * Persist ring to durable storage
   */
  private async persistRing(): Promise<void> {
    if (this.ring) {
      await this.state.storage.put('ring', { ring: serializeRing(this.ring) });
    }
  }

  /**
   * Main fetch handler - routes requests to appropriate shard or handles admin ops
   */
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // Admin/management endpoints
    if (path.startsWith('/admin')) {
      return this.handleAdminRequest(request);
    }

    // Health check endpoint
    if (path === '/health') {
      return this.handleHealthCheck();
    }

    // Default: route to shard based on strategyId
    const strategyId = url.searchParams.get('strategyId');
    if (!strategyId) {
      return Response.json(
        { error: 'strategyId query parameter required' },
        { status: 400 }
      );
    }

    try {
      const shardId = this.getShardForStrategy(strategyId);

      // Return routing info - actual shard DO will handle execution
      return Response.json({
        shardId,
        shardBinding: `SHARD_${shardId}`,
        strategyId,
        message: 'Route to appropriate StrategyShard DO',
      });
    } catch (error) {
      logger.error('[ShardManager] Routing error:', { error, strategyId });
      return Response.json(
        { error: 'Failed to route strategy' },
        { status: 500 }
      );
    }
  }

  /**
   * Get shard assignment for a strategy
   * Called by StrategyRouter to determine target shard
   */
  getShardForStrategy(strategyId: string): number {
    if (!this.ring) {
      throw new Error('Hash ring not initialized');
    }
    return getShardForStrategy(this.ring, strategyId);
  }

  /**
   * Get current ring state (for debugging/monitoring)
   */
  async getRingState(): Promise<{
    totalShards: number;
    virtualNodesPerShard: number;
    distribution: Map<number, number>;
    balanced: boolean;
  }> {
    if (!this.ring) {
      throw new Error('Ring not initialized');
    }

    const allStrategyIds = await this.getAllStrategyIds();
    const distribution = getDistribution(this.ring, allStrategyIds);
    const balanced = isBalanced(distribution);

    return {
      totalShards: this.TOTAL_SHARDS,
      virtualNodesPerShard: this.VIRTUAL_NODES_PER_SHARD,
      distribution,
      balanced,
    };
  }

  /**
   * Rebalance shards - redistribute virtual nodes for better distribution
   */
  async rebalance(): Promise<{
    previous: Map<number, number>;
    updated: Map<number, number>;
  }> {
    if (!this.ring) {
      throw new Error('Ring not initialized');
    }

    const allStrategyIds = await this.getAllStrategyIds();
    const previous = getDistribution(this.ring, allStrategyIds);

    // Rebuild ring (could add randomization based on timestamp)
    this.ring = buildRing(this.TOTAL_SHARDS, this.VIRTUAL_NODES_PER_SHARD);
    await this.persistRing();

    const updated = getDistribution(this.ring, allStrategyIds);

    logger.info('[ShardManager] Ring rebalanced', {
      previous: Object.fromEntries(previous),
      updated: Object.fromEntries(updated),
    });

    return { previous, updated };
  }

  /**
   * Update shard health status
   * Called by StrategyShard DOs to report health
   */
  async updateShardHealth(shardId: number, health: Partial<ShardHealth>): Promise<void> {
    const existing = this.shardHealths.get(shardId) || {
      shardId,
      lastHeartbeat: Date.now(),
      rps: 0,
      avgLatencyMs: 0,
      errorCount: 0,
      strategyCount: 0,
      status: 'healthy',
    };

    const updated = { ...existing, ...health, lastHeartbeat: Date.now() };
    this.shardHealths.set(shardId, updated);

    await this.state.storage.put('shardHealths', this.shardHealths);

    // Also publish to Redis for cross-region visibility
    await this.redis.hset(
      'shard:health',
      shardId.toString(),
      JSON.stringify(updated)
    );
  }

  /**
   * Get health for all shards
   */
  getShardHealths(): ShardHealth[] {
    return Array.from(this.shardHealths.values()).sort((a, b) => a.shardId - b.shardId);
  }

  /**
   * Record metrics for a shard
   */
  async recordMetrics(
    shardId: number,
    latencyMs: number,
    success: boolean
  ): Promise<void> {
    let metrics = this.shardMetrics.get(shardId) || {
      requests: 0,
      errors: 0,
      totalLatencyMs: 0,
      lastUpdated: Date.now(),
    };

    metrics.requests++;
    if (!success) {
      metrics.errors++;
    }
    metrics.totalLatencyMs += latencyMs;
    metrics.lastUpdated = Date.now();

    this.shardMetrics.set(shardId, metrics);
    await this.state.storage.put('shardMetrics', this.shardMetrics);

    // Calculate RPS over sliding window (simplified)
    const rps = metrics.requests / 10; // Approximation
    const avgLatency = metrics.totalLatencyMs / metrics.requests;

    await this.updateShardHealth(shardId, {
      rps,
      avgLatencyMs: avgLatency,
    });
  }

  /**
   * Admin request handler
   */
  private async handleAdminRequest(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const method = request.method;

    try {
      // Check auth (simplified - would integrate with better-auth)
      if (!this.isAdminRequest(request)) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
      }

      if (url.pathname === '/admin/shard/ring' && method === 'GET') {
        const state = await this.getRingState();
        return Response.json({
          totalShards: state.totalShards,
          virtualNodesPerShard: state.virtualNodesPerShard,
          distribution: Object.fromEntries(state.distribution),
          balanced: state.balanced,
        });
      }

      if (url.pathname === '/admin/shard/rebalance' && method === 'POST') {
        const result = await this.rebalance();
        return Response.json({
          success: true,
          previous: Object.fromEntries(result.previous),
          updated: Object.fromEntries(result.updated),
        });
      }

      if (url.pathname === '/admin/shard/health' && method === 'GET') {
        return Response.json(this.getShardHealths());
      }

      if (url.pathname === '/admin/shard/metrics' && method === 'GET') {
        const metrics = Array.from(this.shardMetrics.entries()).map(
          ([shardId, m]) => ({
            shardId,
            ...m,
            avgLatencyMs: m.totalLatencyMs / Math.max(1, m.requests),
          })
        );
        return Response.json(metrics.sort((a, b) => a.shardId - b.shardId));
      }

      return Response.json(
        { error: 'Unknown admin endpoint' },
        { status: 404 }
      );
    } catch (error) {
      logger.error('[ShardManager] Admin request error:', { error, url: url.pathname });
      return Response.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }
  }

  /**
   * Health check endpoint
   */
  private async handleHealthCheck(): Promise<Response> {
    const unhealthy = this.shardHealths.values();
    const offline = Array.from(unhealthy).filter(h => h.status === 'offline');

    return Response.json({
      status: offline.length > 0 ? 'degraded' : 'healthy',
      shardsTotal: this.shardHealths.size,
      shardsOffline: offline.length,
      ringInitialized: this.ring !== null,
      timestamp: Date.now(),
    });
  }

  /**
   * Fetch all strategy IDs from registry
   * In production, this would query a strategy registry or database
   */
  private async getAllStrategyIds(): Promise<string[]> {
    // Try Redis cache first
    const cached = await this.redis.get('strategies:all');
    if (cached) {
      return JSON.parse(cached);
    }

    // Get from strategy registry (would be populated by strategy loader)
    const registryKey = 'strategies:registry';
    const registryJson = await this.redis.get(registryKey);
    if (registryJson) {
      const registry = JSON.parse(registryJson);
      const strategyIds = Object.keys(registry);
      await this.redis.setex('strategies:all', 300, JSON.stringify(strategyIds));
      return strategyIds;
    }

    // Fallback: return known strategies based on current assignment
    // In production, this would be a proper registry query
    const shardAssignments = await this.state.storage.get<Map<string, number>>('strategyAssignments');
    if (shardAssignments) {
      return Array.from(shardAssignments.keys());
    }

    return [];
  }

  /**
   * Simple admin auth check (integrate with better-auth in production)
   */
  private isAdminRequest(request: Request): boolean {
    const auth = request.headers.get('Authorization');
    if (!auth) return false;

    // Check for admin API key or JWT
    const apiKey = request.headers.get('X-Admin-Key');
    if (apiKey && process.env.ADMIN_API_KEY) {
      return apiKey === process.env.ADMIN_API_KEY;
    }

    // JWT check would go here
    return false;
  }

  /**
   * Periodic health reporting (called by alarm)
   */
  async alarm(): Promise<void> {
    try {
      // Collect and report metrics for all shards
      for (const [shardId, metrics] of this.shardMetrics.entries()) {
        const avgLatency = metrics.requests > 0 ? metrics.totalLatencyMs / metrics.requests : 0;
        const rps = metrics.requests / 10;

        await this.updateShardHealth(shardId, {
          rps,
          avgLatencyMs: avgLatency,
          errorCount: metrics.errors,
        });
      }
    } catch (error) {
      logger.error('[ShardManager] Alarm failed:', error);
    }
  }
}
