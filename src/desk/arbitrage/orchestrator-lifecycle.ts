/**
 * Strategy Orchestrator Lifecycle Helpers
 * Manages start and stop sequences for StrategyOrchestrator
 */

import { logger } from '../../shared/utils/logger';
import type { OrchestratorContext } from './orchestrator-types';
import type { FeedAggregator } from '../feeds/feed-aggregator';
import type { UnifiedExecutionEngine } from './unified-executor';
import { drainQueue } from './orchestrator-queue';

export interface OrchestratorLifecycleHost {
  running: boolean;
  startTime: number;
  intervalId: NodeJS.Timeout | null;
  feedAggregator: FeedAggregator;
  executionEngine: UnifiedExecutionEngine;
  getOrchestratorContext(): OrchestratorContext;
  scanAndExecute(): Promise<void>;
  emit(event: string, ...args: unknown[]): boolean;
}

export async function startOrchestrator(host: OrchestratorLifecycleHost): Promise<void> {
  const ctx = host.getOrchestratorContext();
  if (host.running) {
    logger.warn('[Orchestrator] Already running');
    return;
  }

  logger.info('[Orchestrator] Starting strategy orchestrator...');
  host.startTime = Date.now();
  host.running = true;
  ctx.metrics.isRunning = true;

  try {
    await host.feedAggregator.connect();
    ctx.metrics.feedConnected = true;

    await host.feedAggregator.subscribe(ctx.config.symbols);

    host.intervalId = setInterval(async () => {
      await host.scanAndExecute();
    }, ctx.config.checkIntervalMs);

    logger.info('[Orchestrator] Strategy orchestrator started', {
      symbols: ctx.config.symbols.length,
      exchanges: ctx.config.exchanges.length,
      queueCapacity: ctx.config.maxQueueSize,
      dryRun: ctx.config.dryRun,
    });

    host.emit('started', {
      symbols: ctx.config.symbols,
      exchanges: ctx.config.exchanges,
    });
  } catch (error) {
    host.running = false;
    ctx.metrics.isRunning = false;
    logger.error('[Orchestrator] Failed to start:', { error });
    throw error;
  }
}

export async function stopOrchestrator(host: OrchestratorLifecycleHost): Promise<void> {
  const ctx = host.getOrchestratorContext();
  if (!host.running) {
    logger.warn('[Orchestrator] Not running');
    return;
  }

  logger.info('[Orchestrator] Stopping strategy orchestrator...');
  host.running = false;
  ctx.metrics.isRunning = false;

  if (host.intervalId) {
    clearInterval(host.intervalId);
    host.intervalId = null;
  }

  await drainQueue(ctx, host.executionEngine);

  await host.feedAggregator.disconnect();
  ctx.metrics.feedConnected = false;

  logger.info('[Orchestrator] Strategy orchestrator stopped', {
    uptimeMs: Date.now() - host.startTime,
    totalExecutions: ctx.metrics.executionsAttempted,
    totalProfit: ctx.metrics.totalProfit,
  });
}
