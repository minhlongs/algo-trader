/**
 * Orchestrator Queue Management
 * Handles backpressure-based queue for opportunities
 * Extracted from StrategyOrchestrator for single-responsibility compliance
 */

import type { ArbitrageOpportunity, ExecutionResult } from './types';
import type { SignalScore } from './signal-scorer';
import type { QueuedOpportunity, OrchestratorContext } from './orchestrator-types';
import type { UnifiedExecutionEngine } from './unified-executor';
import { logger } from '../../shared/utils/logger';

export interface ProcessQueueOptions {
  maxConcurrent?: number;
  /** Filter expired opportunities before processing (default: true) */
  filterExpired?: boolean;
  /** Called after each execution attempt with latency in ms */
  onExecutionComplete?: (result: ExecutionResult, latencyMs: number) => void;
}

/**
 * Add opportunity to queue with backpressure handling.
 * If queue is full, drops lowest-scored opportunity.
 */
export function enqueueOpportunity(
  ctx: OrchestratorContext,
  opp: ArbitrageOpportunity,
  score: SignalScore
): void {
  if (ctx.config.maxQueueSize != null && ctx.queue.length >= ctx.config.maxQueueSize) {
    ctx.queue.sort((a, b) => a.score.totalScore - b.score.totalScore);
    ctx.queue.shift();
    ctx.queueDropped++;
    ctx.metrics.queueDropped = ctx.queueDropped;
    logger.debug('[Orchestrator] Queue full, dropped lowest-scored opportunity');
  }

  ctx.queue.push({ opportunity: opp, score, enqueuedAt: Date.now() });
  ctx.queue.sort((a, b) => b.score.totalScore - a.score.totalScore);
  ctx.metrics.queueSize = ctx.queue.length;
}

/**
 * Process queue - execute top-priority opportunities.
 * Supports expiry filtering and execution callbacks.
 */
export async function processQueue(
  ctx: OrchestratorContext,
  executionEngine: UnifiedExecutionEngine,
  options: ProcessQueueOptions = {}
): Promise<ExecutionResult[]> {
  const { maxConcurrent = 3, filterExpired = true, onExecutionComplete } = options;
  const results: ExecutionResult[] = [];

  // Optionally remove expired opportunities
  if (filterExpired) {
    const now = Date.now();
    ctx.queue = ctx.queue.filter(q => q.opportunity.expiresAt > now);
    ctx.metrics.queueSize = ctx.queue.length;
  }

  while (ctx.queue.length > 0 && results.length < maxConcurrent) {
    const queued = ctx.queue.shift()!;
    ctx.metrics.queueSize = ctx.queue.length;
    ctx.metrics.executionsAttempted++;

    const execStart = Date.now();
    try {
      const result = await executionEngine.execute(queued.opportunity);
      const latencyMs = Date.now() - execStart;
      results.push(result);

      if (result.success) {
        ctx.metrics.executionsSucceeded++;
      } else {
        ctx.metrics.executionsFailed++;
      }

      onExecutionComplete?.(result, latencyMs);
    } catch (error) {
      const latencyMs = Date.now() - execStart;
      ctx.metrics.executionsFailed++;
      logger.error('[Orchestrator] Execution error:', { error });
      onExecutionComplete?.(
        { opportunityId: '', success: false, executedLegs: [], actualProfit: 0, actualProfitPct: 0, totalFees: 0, executedAt: Date.now(), error: String(error) },
        latencyMs
      );
    }
  }

  return results;
}

/**
 * Drain remaining queue on shutdown
 */
export async function drainQueue(
  ctx: OrchestratorContext,
  executionEngine: UnifiedExecutionEngine
): Promise<void> {
  logger.info('[Orchestrator] Draining queue...', { remaining: ctx.queue.length });

  for (const queued of ctx.queue) {
    try {
      await executionEngine.execute(queued.opportunity);
    } catch (error) {
      logger.error('[Orchestrator] Drain execution error:', { error });
    }
  }

  ctx.queue = [];
  ctx.metrics.queueSize = 0;
}
