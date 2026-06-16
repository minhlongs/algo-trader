/**
 * Strategy Shard Durable Object
 * Hosts 4-5 strategies and executes them with isolated state
 * One instance per shard (12 total)
 */

import { DurableObject, DurableObjectState } from '@cloudflare/workers-types';
import { getRedisClient, type RedisClientType } from '../redis';
import { logger } from '../utils/logger';
import { ShardManager } from './shard-manager';
import type { IStrategy, StrategySignal } from '../strategies/types';
import { StrategyLoader } from '../strategies/loader';

export interface ShardExecutionResult {
  success: boolean;
  strategyId: string;
  signal?: 'BUY' | 'SELL' | 'HOLD';
  confidence?: number;
  latencyMs: number;
  error?: string;
}

export interface ShardMetrics {
  requests: number;
  errors: number;
  totalLatencyMs: number;
  queueLength: number;
  strategiesLoaded: number;
  lastUpdated: number;
}

export class StrategyShard implements DurableObject {
  private state: DurableObjectState;
  private redis: RedisClientType;
  private shardId: number;

  // Strategy instances (4-5 per shard)
  private strategies: Map<string, IStrategy> = new Map();
  private strategyLoader: StrategyLoader;

  // Metrics and backpressure
  private metrics: ShardMetrics = {
    requests: 0,
    errors: 0,
    totalLatencyMs: 0,
    queueLength: 0,
    strategiesLoaded: 0,
    lastUpdated: Date.now(),
  };

  // Request queue for backpressure
  private readonly MAX_QUEUE_SIZE = 100;
  private readonly MAX_CONCURRENT = 10;
  private activeExecutions = 0;

  constructor(state: DurableObjectState) {
    this.state = state;
    this.redis = getRedisClient();

    // Extract shardId from binding name (SHARD_0, SHARD_1, etc.)
    this.shardId = this.extractShardId();

    this.strategyLoader = new StrategyLoader();
    this.initialize().catch(error => {
      logger.error('[StrategyShard] Init failed:', error);
    });
  }

  /**
   * Extract shard ID from binding or configuration
   */
  private extractShardId(): number {
    const bindingName = this.state.bindingName;
    if (bindingName?.startsWith('SHARD_')) {
      const id = parseInt(bindingName.replace('SHARD_', ''), 10);
      if (!isNaN(id)) return id;
    }

    const shardEnv = process.env.SHARD_ID;
    if (shardEnv) {
      const id = parseInt(shardEnv, 10);
      if (!isNaN(id)) return id;
    }

    logger.warn('[StrategyShard] Could not determine shard ID, defaulting to 0');
    return 0;
  }

  /**
   * Initialize shard: load assigned strategies
   */
  private async initialize(): Promise<void> {
    try {
      // Get this shard's assigned strategies from ShardManager or Redis
      const assignments = await this.getStrategyAssignments();

      // Load each strategy
      for (const strategyId of assignments) {
        try {
          const strategy = await this.strategyLoader.loadStrategy(strategyId);
          if (strategy) {
            this.strategies.set(strategyId, strategy);
            logger.info('[StrategyShard] Loaded strategy', {
              shardId: this.shardId,
              strategyId,
            });
          }
        } catch (error) {
          logger.error('[StrategyShard] Failed to load strategy', {
            shardId: this.shardId,
            strategyId,
            error,
          });
        }
      }

      this.metrics.strategiesLoaded = this.strategies.size;

      // Register shard health with ShardManager
      await this.registerHealth();

      // Restore metrics from storage
      await this.restoreMetrics();

      logger.info('[StrategyShard] Initialized', {
        shardId: this.shardId,
        strategies: this.strategies.size,
      });
    } catch (error) {
      logger.error('[StrategyShard] Initialization failed:', error);
      throw error;
    }
  }

  /**
   * Get strategy assignments for this shard
   */
  private async getStrategyAssignments(): Promise<string[]> {
    const assignmentsKey = `shard:${this.shardId}:strategies`;
    const cached = await this.redis.smembers(assignmentsKey);
    if (cached.length > 0) {
      return cached;
    }

    const stored = await this.state.storage.get<string[]>('assignedStrategies');
    if (stored) {
      return stored;
    }

    logger.warn('[StrategyShard] No strategy assignments found');
    return [];
  }

  /**
   * Register shard health with ShardManager
   */
  private async registerHealth(): Promise<void> {
    const shardManager = this.state.env.SHARD_MANAGER as unknown as ShardManager;
    if (shardManager) {
      await shardManager.updateShardHealth(this.shardId, {
        shardId: this.shardId,
        lastHeartbeat: Date.now(),
        rps: 0,
        avgLatencyMs: 0,
        errorCount: 0,
        strategyCount: this.strategies.size,
        status: 'healthy',
      });
    }
  }

  /**
   * Restore metrics from storage (compressed)
   */
  private async restoreMetrics(): Promise<void> {
    try {
      const compressed = await this.state.storage.get<{ data: string; compressed: boolean }>('metrics');
      if (compressed?.compressed) {
        // Decompress if stored compressed
        const decompressed = await this.decompress(compressed.data);
        this.metrics = JSON.parse(decompressed) as ShardMetrics;
      } else if (compressed?.data) {
        this.metrics = JSON.parse(compressed.data) as ShardMetrics;
      } else if (compressed) {
        // Legacy format
        this.metrics = compressed as ShardMetrics;
      }
    } catch (error) {
      logger.error('[StrategyShard] Failed to restore metrics:', error);
      // Keep default empty metrics
    }
  }

  /**
   * Persist metrics to storage (with compression)
   */
  private async persistMetrics(): Promise<void> {
    this.metrics.lastUpdated = Date.now();

    try {
      const data = JSON.stringify(this.metrics);
      const compressed = await this.compress(data);

      await this.state.storage.put('metrics', {
        data: compressed,
        compressed: true,
      });
    } catch (error) {
      logger.error('[StrategyShard] Failed to persist metrics:', error);
      // Fallback: store uncompressed
      await this.state.storage.put('metrics', this.metrics);
    }
  }

  /**
   * Compress string using Brotli
   */
  private async compress(data: string): Promise<string> {
    // Use native CompressionStream if available
    if (typeof CompressionStream !== 'undefined') {
      try {
        const cs = new CompressionStream('br');
        const writer = cs.writable.getWriter();
        const reader = cs.readable.getReader();
        const encoder = new TextEncoder();

        writer.write(data);
        writer.close();

        const chunks: Uint8Array[] = [];
        let done = false;
        while (!done) {
          const { value, done: isDone } = await reader.read();
          if (value) chunks.push(value);
          done = isDone;
        }

        // Convert to base64 for storage
        const totalLength = chunks.reduce((sum, c) => sum + c.length, 0);
        const buffer = new Uint8Array(totalLength);
        let offset = 0;
        for (const chunk of chunks) {
          buffer.set(chunk, offset);
          offset += chunk.length;
        }

        return btoa(String.fromCharCode(...buffer));
      } catch (error) {
        logger.warn('[StrategyShard] Compression failed, using uncompressed:', error);
      }
    }

    // Fallback: return as base64 without compression
    return btoa(data);
  }

  /**
   * Decompress string from storage
   */
  private async decompress(compressedData: string): Promise<string> {
    try {
      const binary = atob(compressedData);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }

      if (typeof DecompressionStream !== 'undefined') {
        const ds = new DecompressionStream('br');
        const writer = ds.writable.getWriter();
        const reader = ds.readable.getReader();

        writer.write(bytes);
        writer.close();

        const chunks: Uint8Array[] = [];
        let done = false;
        while (!done) {
          const { value, done: isDone } = await reader.read();
          if (value) chunks.push(value);
          done = isDone;
        }

        const totalLength = chunks.reduce((sum, c) => sum + c.length, 0);
        const buffer = new Uint8Array(totalLength);
        let offset = 0;
        for (const chunk of chunks) {
          buffer.set(chunk, offset);
          offset += chunk.length;
        }

        return new TextDecoder().decode(buffer);
      }

      // Fallback: decode without decompression
      return new TextDecoder().decode(bytes);
    } catch (error) {
      logger.error('[StrategyShard] Decompression failed:', error);
      throw error;
    }
  }

  /**
   * Main fetch handler
   */
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // Health check endpoint
    if (path === '/health') {
      return this.handleHealthCheck();
    }

    // Strategy execution endpoint
    if (path === '/execute' && request.method === 'POST') {
      return this.handleExecute(request);
    }

    // Metrics endpoint
    if (path === '/metrics') {
      return this.handleMetrics();
    }

    // Shard info endpoint
    if (path === '/info') {
      return Response.json({
        shardId: this.shardId,
        strategies: Array.from(this.strategies.keys()),
        strategiesLoaded: this.strategies.size,
        metrics: this.metrics,
      });
    }

    return Response.json({ error: 'Not found' }, { status: 404 });
  }

  /**
   * Handle strategy execution request
   */
  private async handleExecute(request: Request): Promise<Response> {
    // Backpressure check
    if (this.metrics.queueLength >= this.MAX_QUEUE_SIZE) {
      return Response.json(
        { error: 'Shard overloaded - try again later' },
        { status: 429 }
      );
    }

    // Concurrency check
    if (this.activeExecutions >= this.MAX_CONCURRENT) {
      this.metrics.queueLength++;
      return Response.json(
        { error: 'All executors busy - queued' },
        { status: 503 }
      );
    }

    this.metrics.queueLength++;

    try {
      const body = await request.json<{
        strategyId: string;
        marketData: Record<string, unknown>;
        capitalUsdt?: number;
      }>();

      const { strategyId, marketData } = body;

      // Check if strategy is assigned to this shard
      const strategy = this.strategies.get(strategyId);
      if (!strategy) {
        return Response.json(
          { error: `Strategy ${strategyId} not found on this shard` },
          { status: 404 }
        );
      }

      const startTime = Date.now();
      this.activeExecutions++;

      try {
        // Execute strategy
        const result = this.executeStrategy(strategy, marketData);
        const latencyMs = Date.now() - startTime;

        // Update metrics
        this.metrics.requests++;
        this.metrics.totalLatencyMs += latencyMs;
        this.metrics.queueLength = Math.max(0, this.metrics.queueLength - 1);
        this.persistMetrics();

        // Report to ShardManager
        const shardManager = this.state.env.SHARD_MANAGER as unknown as ShardManager;
        if (shardManager) {
          shardManager.recordMetrics(this.shardId, latencyMs, true).catch(() => {});
        }

        return Response.json({
          ...result,
          shardId: this.shardId,
          latencyMs,
        } as ShardExecutionResult);
      } finally {
        this.activeExecutions--;
      }
    } catch (error) {
      this.metrics.errors++;
      this.metrics.queueLength = Math.max(0, this.metrics.queueLength - 1);
      this.persistMetrics();

      logger.error('[StrategyShard] Execution error:', {
        shardId: this.shardId,
        error,
      });

      return Response.json(
        { error: 'Strategy execution failed', details: String(error) },
        { status: 500 }
      );
    }
  }

  /**
   * Execute a single strategy (synchronous version)
   */
  private executeStrategy(
    strategy: IStrategy,
    marketData: Record<string, unknown>
  ): {
    signal: 'BUY' | 'SELL' | 'HOLD';
    confidence: number;
    metadata?: Record<string, unknown>;
  } {
    // Check if strategy has execute method
    if (typeof strategy.execute === 'function') {
      return strategy.execute(marketData);
    }

    // Check for tick-based strategy pattern
    if (typeof strategy.onTick === 'function') {
      const result = strategy.onTick(marketData as any);
      return {
        signal: result.signal,
        confidence: result.confidence || 0.5,
        metadata: result.metadata,
      };
    }

    throw new Error('Strategy does not implement execute or onTick');
  }

  /**
   * Handle health check
   */
  private handleHealthCheck(): Response {
    const healthy = this.activeExecutions < this.MAX_CONCURRENT;
    const memoryInfo = this.getMemoryInfo();

    return Response.json({
      shardId: this.shardId,
      status: healthy ? 'healthy' : 'degraded',
      activeExecutions: this.activeExecutions,
      maxConcurrent: this.MAX_CONCURRENT,
      queueLength: this.metrics.queueLength,
      strategiesLoaded: this.strategies.size,
      memory: memoryInfo,
      timestamp: Date.now(),
    });
  }

  /**
   * Handle metrics endpoint
   */
  private handleMetrics(): Response {
    const avgLatency =
      this.metrics.requests > 0
        ? this.metrics.totalLatencyMs / this.metrics.requests
        : 0;

    return Response.json({
      shardId: this.shardId,
      ...this.metrics,
      avgLatencyMs: avgLatency,
    });
  }

  /**
   * Get memory info (Cloudflare Workers specific)
   */
  private getMemoryInfo(): { rss: number; heapUsed: number } {
    if (typeof performance !== 'undefined' && 'memory' in performance) {
      const mem = (performance as any).memory;
      return {
        rss: mem.rss,
        heapUsed: mem.usedJSHeapSize,
      };
    }
    return { rss: 0, heapUsed: 0 };
  }

  /**
   * Periodic health reporting (called by alarm)
   */
  async alarm(): Promise<void> {
    try {
      const health = {
        shardId: this.shardId,
        lastHeartbeat: Date.now(),
        rps: this.metrics.requests / 10,
        avgLatencyMs:
          this.metrics.requests > 0
            ? this.metrics.totalLatencyMs / this.metrics.requests
            : 0,
        errorCount: this.metrics.errors,
        strategyCount: this.strategies.size,
        status: this.activeExecutions < this.MAX_CONCURRENT ? 'healthy' : 'degraded',
      };

      const shardManager = this.state.env.SHARD_MANAGER as unknown as ShardManager;
      if (shardManager) {
        await shardManager.updateShardHealth(this.shardId, health).catch(() => {});
      }

      await this.redis.hset(
        'shard:health',
        this.shardId.toString(),
        JSON.stringify(health)
      );
    } catch (error) {
      logger.error('[StrategyShard] Alarm failed:', error);
    }
  }
}
