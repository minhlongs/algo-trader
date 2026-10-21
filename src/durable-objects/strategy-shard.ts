/**
 * Strategy Shard Durable Object
 * Hosts 4-5 strategies and executes them with isolated state
 * One instance per shard (12 total)
 */

import type { DurableObjectState } from '@cloudflare/workers-types';
import type { RedisClientType } from '../redis';
import { logger } from '../utils/logger';
import { ShardManager } from './shard-manager';
import type { IStrategy } from '../desk/strategies/types';
import type { Env, ShardMetrics } from './strategy-shard-types';
import { initializeShard, persistHealth, restoreMetrics } from './strategy-shard-state';
import { handleHealthCheck, handleMetricsResponse, handleExecute } from './shard-fetch-handlers';
import { buildShardHealth, deriveShardId } from './strategy-shard-identity';

export type { Env, ShardExecutionResult, ShardMetrics } from './strategy-shard-types';

export class StrategyShard {
  private state: DurableObjectState;
  private redis: RedisClientType | null = null;
  private shardId: number;
  private currentEnv?: Env;
  private strategies: Map<string, IStrategy> = new Map();

  private metrics: ShardMetrics = {
    requests: 0,
    errors: 0,
    totalLatencyMs: 0,
    queueLength: 0,
    strategiesLoaded: 0,
    lastUpdated: Date.now(),
  };

  private readonly MAX_QUEUE_SIZE = 100;
  private readonly MAX_CONCURRENT = 10;
  private activeExecutions = 0;

  constructor(state: DurableObjectState, shardId?: number) {
    this.state = state;
    this.currentEnv = (state as unknown as { env?: Env }).env;
    this.shardId = shardId !== undefined ? shardId : this.extractShardId();
    if (typeof this.state.blockConcurrencyWhile === 'function') {
      this.state.blockConcurrencyWhile(async () => {
        await this.initialize();
      }).catch((error: unknown) => {
        logger.error('[StrategyShard] Init failed:', error);
      });
    } else {
      this.initialize().catch((error: unknown) => {
        logger.error('[StrategyShard] Init failed:', error);
      });
    }
  }

  private extractShardId(): number {
    return deriveShardId(this.state);
  }

  private async initialize(): Promise<void> {
    try {
      await initializeShard(this.shardId, this.state.storage, this.currentEnv, this.strategies);
      this.metrics.strategiesLoaded = this.strategies.size;
      this.metrics = await restoreMetrics(this.state.storage);
      logger.info('[StrategyShard] Initialized', { shardId: this.shardId, strategies: this.strategies.size });
    } catch (error) {
      logger.error('[StrategyShard] Initialization failed:', error);
      throw error;
    }
  }

  async fetch(request: Request): Promise<Response> {
    const env = (this.state as unknown as { env?: Env }).env as Env;
    if (!this.currentEnv) this.currentEnv = env;

    const url = new URL(request.url);
    const pathname = url.pathname;

    if (pathname === '/health') {
      return this.handleHealthCheck();
    }
    if (pathname === '/execute' && request.method === 'POST') {
      return this.handleExecute(request);
    }
    if (pathname === '/metrics') {
      return handleMetricsResponse(this.shardId, this.metrics);
    }
    if (pathname === '/info') {
      return Response.json({
        shardId: this.shardId,
        strategies: Array.from(this.strategies.keys()),
        strategiesLoaded: this.strategies.size,
        metrics: this.metrics,
      });
    }

    return Response.json({ error: 'Not found' }, { status: 404 });
  }

  /** Public health-check delegate for callers outside DO fetch path */
  handleHealthCheck(): Response {
    return handleHealthCheck({
      shardId: this.shardId,
      activeExecutions: this.activeExecutions,
      maxConcurrent: this.MAX_CONCURRENT,
      metrics: this.metrics,
      strategiesLoaded: this.strategies.size,
    });
  }

  /** Public execute delegate for callers outside DO fetch path */
  async handleExecute(request: Request): Promise<Response> {
    const env = (this.state as unknown as { env?: Env }).env as Env;
    return handleExecute(request, env, {
      shardId: this.shardId,
      metrics: this.metrics,
      activeExecutions: this.activeExecutions,
      maxConcurrent: this.MAX_CONCURRENT,
      maxQueueSize: this.MAX_QUEUE_SIZE,
      storage: this.state.storage,
      strategies: this.strategies,
    });
  }

  async alarm(): Promise<void> {
    try {
      this.metrics = await restoreMetrics(this.state.storage);

      const health = buildShardHealth(
        this.shardId,
        this.metrics,
        this.strategies.size,
        this.activeExecutions,
        this.MAX_CONCURRENT,
      );

      const shardManager = this.currentEnv?.SHARD_MANAGER as unknown as ShardManager;
      if (shardManager) {
        shardManager.updateShardHealth(this.shardId, health);
      }

      await persistHealth(this.shardId, health);
    } catch (error) {
      logger.error('[StrategyShard] Alarm failed:', error);
    }
  }
}
