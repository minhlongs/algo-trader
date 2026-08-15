/**
 * Orchestrator Scan & Feed Handler
 * Extracted from StrategyOrchestrator for single-responsibility compliance.
 * Standalone functions that operate on an OrchestratorContext.
 */

import type { FeedMessage } from '../feeds/feed-aggregator';
import type { ExecutionResult, ArbitrageOpportunity } from './types';
import type { OrchestratorContext } from './orchestrator-types';
import { processQueue, enqueueOpportunity } from './orchestrator-queue';
import { convertToUnifiedOpportunity, matchesStrategyFilter } from './orchestrator-conversion';
import { logger } from '../../shared/utils/logger';

/**
 * Single scan cycle: detect spreads, score signals, enqueue qualifying opportunities.
 */
export async function scanAndExecute(ctx: OrchestratorContext): Promise<void> {
  if (!ctx.running) return;

  const scanStart = Date.now();

  try {
    const spreadOpportunities = await ctx.spreadDetector.scan(
      ctx.config.symbols,
      ctx.config.exchanges
    );

    ctx.metrics.scansPerformed++;
    ctx.metrics.opportunitiesDetected += spreadOpportunities.length;

    const detectionLatency = Date.now() - scanStart;
    ctx.detectionLatencies.push(detectionLatency);
    if (ctx.detectionLatencies.length > 1000) ctx.detectionLatencies.shift();

    for (const spreadOpp of spreadOpportunities) {
      const score = ctx.signalScorer.score(spreadOpp);
      ctx.metrics.signalsScored++;

      if (score.recommendation === 'STRONG_BUY' || score.recommendation === 'BUY') {
        ctx.metrics.actionableSignals++;
        const unifiedOpp: ArbitrageOpportunity = convertToUnifiedOpportunity(spreadOpp);

        if (!ctx.config.strategy || matchesStrategyFilter(unifiedOpp, ctx.config.strategy)) {
          enqueueOpportunity(ctx, unifiedOpp, score);
        }
      }
    }

    await processQueue(ctx, ctx.executionEngine, {
      filterExpired: true,
      onExecutionComplete: (result: ExecutionResult, latencyMs: number) => {
        ctx.executionLatencies.push(latencyMs);
        if (ctx.executionLatencies.length > 1000) ctx.executionLatencies.shift();

        if (result.success) {
          ctx.metrics.totalProfit += result.actualProfit;
        }

        if (ctx.config.verbose) {
          logger.info('[Orchestrator] Execution result', {
            id: result.opportunityId,
            success: result.success,
            profit: result.actualProfit,
            latencyMs,
          });
        }
      },
    });
  } catch (error) {
    logger.error('[Orchestrator] Scan cycle error:', { error });
  }
}

/**
 * Process a single feed message — track metrics only.
 */
export function handleFeedMessage(ctx: OrchestratorContext, _msg: FeedMessage): void {
  ctx.metrics.messagesReceived++;
}
