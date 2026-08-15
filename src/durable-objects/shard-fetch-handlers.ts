/**
 * Fetch handler routing for StrategyShard.
 * Standalone functions that handle individual HTTP routes.
 */

import type { ShardMetrics, Env, ShardExecutionResult } from './strategy-shard-types';
import type { IStrategy } from '../desk/strategies/types';
import { ShardManager } from './shard-manager';
import { getMemoryInfo, computeAvgLatency } from './shard-metrics';
import { persistMetrics } from './strategy-shard-state';
import { logger } from '../utils/logger';

interface HealthCheckParams {
  shardId: number;
  activeExecutions: number;
  maxConcurrent: number;
  metrics: ShardMetrics;
  strategiesLoaded: number;
}

export function handleHealthCheck(params: HealthCheckParams): Response {
  const healthy = params.activeExecutions < params.maxConcurrent;
  const memoryInfo = getMemoryInfo();
  return Response.json({
    shardId: params.shardId,
    status: healthy ? 'healthy' : 'degraded',
    activeExecutions: params.activeExecutions,
    maxConcurrent: params.maxConcurrent,
    queueLength: params.metrics.queueLength,
    strategiesLoaded: params.strategiesLoaded,
    memory: memoryInfo,
    timestamp: Date.now(),
  });
}

export function handleMetricsResponse(shardId: number, metrics: ShardMetrics): Response {
  return Response.json({
    shardId,
    ...metrics,
    avgLatencyMs: computeAvgLatency(metrics),
  });
}

/** Execution context passed from the DO class to handleExecute */
export interface ExecuteContext {
  shardId: number;
  metrics: ShardMetrics;
  activeExecutions: number;
  maxConcurrent: number;
  maxQueueSize: number;
  storage: { put: (key: string, value: unknown) => Promise<void> };
  strategies: Map<string, IStrategy>;
}

/**
 * Handle POST /execute — backpressure, concurrency, strategy lookup, execution.
 */
export async function handleExecute(
  request: Request,
  env: Env,
  ctx: ExecuteContext,
): Promise<Response> {
  if (ctx.metrics.queueLength >= ctx.maxQueueSize) {
    return Response.json({ error: 'Shard overloaded - try again later' }, { status: 429 });
  }
  if (ctx.activeExecutions >= ctx.maxConcurrent) {
    ctx.metrics.queueLength++;
    return Response.json({ error: 'All executors busy - queued' }, { status: 503 });
  }
  ctx.metrics.queueLength++;
  ctx.activeExecutions++;

  const startTime = Date.now();
  try {
    const body = (await request.json()) as {
      strategyId: string;
      marketData: Record<string, unknown>;
      capitalUsdt?: number;
    };
    const { strategyId, marketData } = body;
    const strategy = ctx.strategies.get(strategyId);
    if (!strategy) {
      return Response.json({ error: `Strategy ${strategyId} not found on this shard` }, { status: 404 });
    }

    const result = await executeStrategy(strategy, marketData);
    const latencyMs = Date.now() - startTime;

    const execResult: ShardExecutionResult = {
      success: true,
      strategyId,
      signal: result.signal,
      confidence: result.confidence,
      latencyMs,
    };

    ctx.metrics.requests++;
    ctx.metrics.totalLatencyMs += latencyMs;
    ctx.metrics.lastUpdated = Date.now();
    await persistMetrics(ctx.storage as any, ctx.metrics);

    return Response.json(execResult);
  } catch (error) {
    const latencyMs = Date.now() - startTime;
    ctx.metrics.errors++;
    ctx.metrics.totalLatencyMs += latencyMs;
    ctx.metrics.lastUpdated = Date.now();

    const shardManager = env?.SHARD_MANAGER as unknown as ShardManager;
    if (shardManager) {
      shardManager.recordMetrics(ctx.shardId, latencyMs, false);
    }

    logger.error('[StrategyShard] Execution error:', { strategyId: (error as Error).message, latencyMs });
    return Response.json({ error: 'Strategy execution failed', details: String(error) }, { status: 500 });
  } finally {
    ctx.activeExecutions--;
    ctx.metrics.queueLength = Math.max(0, ctx.metrics.queueLength - 1);
  }
}

async function executeStrategy(
  strategy: IStrategy,
  marketData: Record<string, unknown>,
): Promise<{ signal: 'BUY' | 'SELL' | 'HOLD'; confidence: number }> {
  if (typeof strategy.execute === 'function') {
    const result = strategy.execute(marketData);
    return result instanceof Promise ? result : Promise.resolve(result);
  }
  if (typeof strategy.onTick === 'function') {
    return strategy.onTick({ symbol: '', timestamp: Date.now(), bid: 0, ask: 0, last: 0, volume: 0, bids: [], asks: [] });
  }
  throw new Error('Strategy does not implement execute or onTick');
}
