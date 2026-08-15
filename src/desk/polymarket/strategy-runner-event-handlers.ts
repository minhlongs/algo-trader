/**
 * Strategy Runner Event Handlers
 *
 * EventBus subscription and handling logic for the strategy runner.
 * Extracted from main class for better modularity.
 */

import { logger } from '@shared/utils/logger';
import type { TradingEventBus, PriceUpdatePayload } from '../events/trading-event-bus';
import type { BasePolymarketStrategy } from '@desk/strategies/polymarket/base-polymarket-strategy';
import type { StrategyRunnerConfig } from './strategy-runner-types';

// ── Event Handler Context ──────────────────────────────────────────────────────

export interface EventHandlerContext {
  status: string;
  strategy: BasePolymarketStrategy | null;
  config: StrategyRunnerConfig;
  strategyName: string;
  executionCount: number;
  lastExecutionTime: number;
  trackedTokens: { has(token: string): boolean; size: number };
  updateLastExecutionTime: (time: number) => void;
  incrementExecutionCount: () => void;
  stop: () => Promise<void>;
}

// ── Price Update Handler ───────────────────────────────────────────────────────

export async function handlePriceUpdate(
  ctx: EventHandlerContext,
  payload: PriceUpdatePayload,
): Promise<void> {
  if (ctx.status !== 'running' || !ctx.strategy) return;

  // Debounce: prevent execution more than once per minExecutionIntervalMs
  const now = Date.now();
  if (now - ctx.lastExecutionTime < ctx.config.minExecutionIntervalMs!) {
    return;
  }

  // Check if this token is relevant to our strategy
  const isRelevant = ctx.trackedTokens.size === 0 || ctx.trackedTokens.has(payload.tokenId);
  if (!isRelevant) return;

  ctx.updateLastExecutionTime(now);

  try {
    ctx.incrementExecutionCount();
    await ctx.strategy.execute();

    if (ctx.config.maxTicks && ctx.executionCount >= ctx.config.maxTicks) {
      logger.info('Max ticks reached, auto-stopping', 'StrategyRunner', {
        strategy: ctx.strategyName,
        executions: ctx.executionCount,
        maxTicks: ctx.config.maxTicks,
      });
      await ctx.stop();
      return;
    }

    logger.debug('Reactive execution complete', 'StrategyRunner', {
      strategy: ctx.strategyName,
      execution: ctx.executionCount,
      triggerToken: payload.tokenId,
      triggerBid: payload.bid,
      triggerAsk: payload.ask,
    });
  } catch (err) {
    logger.error('Reactive execution error', 'StrategyRunner', {
      err: String(err),
      execution: ctx.executionCount,
    });
  }
}

// ── EventBus Subscription ──────────────────────────────────────────────────────

export function createEventBusSubscription(
  eventBus: TradingEventBus,
  ctx: EventHandlerContext,
): { subscribe: () => void; unsubscribe: () => void; handler: (payload: PriceUpdatePayload) => Promise<void> } {
  const handler = (payload: PriceUpdatePayload) => handlePriceUpdate(ctx, payload);

  return {
    subscribe: () => eventBus.on('PRICE_UPDATE', handler),
    unsubscribe: () => eventBus.off('PRICE_UPDATE', handler),
    handler,
  };
}
