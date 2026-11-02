/**
 * Strategy Runner Event Handlers
 *
 * EventBus subscription and handling logic for the strategy runner.
 * Supports live state getters to avoid stale closure copies and routes ticks
 * through the orchestrator's RiskGate when `executeTick` is provided.
 */

import { logger } from '@shared/utils/logger';
import type { TradingEventBus, PriceUpdatePayload } from '../events/trading-event-bus';
import type { BasePolymarketStrategy } from '@desk/strategies/polymarket/base-polymarket-strategy';
import type { StrategyRunnerConfig } from './strategy-runner-types';

// ── Event Handler Context ──────────────────────────────────────────────────────

export interface EventHandlerContext {
  status: string;
  getStatus?: () => string;
  strategy: BasePolymarketStrategy | null;
  getStrategy?: () => BasePolymarketStrategy | null;
  config: StrategyRunnerConfig;
  strategyName: string;
  executionCount: number;
  getExecutionCount?: () => number;
  lastExecutionTime: number;
  getLastExecutionTime?: () => number;
  trackedTokens: { has(token: string): boolean; size: number };
  updateLastExecutionTime: (time: number) => void;
  incrementExecutionCount: () => void;
  executeTick?: () => Promise<void>;
  stop: () => Promise<void>;
}

// ── Price Update Handler ───────────────────────────────────────────────────────

export async function handlePriceUpdate(
  ctx: EventHandlerContext,
  payload: PriceUpdatePayload,
): Promise<void> {
  const status = ctx.getStatus ? ctx.getStatus() : ctx.status;
  const strategy = ctx.getStrategy ? ctx.getStrategy() : ctx.strategy;
  if (status !== 'running' || !strategy) return;

  // Debounce: prevent execution more than once per minExecutionIntervalMs
  const now = Date.now();
  const lastExec = ctx.getLastExecutionTime ? ctx.getLastExecutionTime() : ctx.lastExecutionTime;
  if (now - lastExec < ctx.config.minExecutionIntervalMs!) {
    return;
  }

  // Check if this token is relevant to our strategy
  const isRelevant = ctx.trackedTokens.size === 0 || ctx.trackedTokens.has(payload.tokenId);
  if (!isRelevant) return;

  if (
    payload.tokenId !== 'tick-trigger' &&
    payload.bid > 0 &&
    payload.ask > 0 &&
    typeof strategy.updatePrice === 'function'
  ) {
    strategy.updatePrice(payload.tokenId, payload.bid, payload.ask);
  }

  ctx.updateLastExecutionTime(now);

  try {
    ctx.incrementExecutionCount();
    if (ctx.executeTick) {
      await ctx.executeTick();
    } else {
      await strategy.execute();
    }

    const currentCount = ctx.getExecutionCount ? ctx.getExecutionCount() : ctx.executionCount;
    if (ctx.config.maxTicks && currentCount >= ctx.config.maxTicks) {
      logger.info('Max ticks reached, auto-stopping', 'StrategyRunner', {
        strategy: ctx.strategyName,
        executions: currentCount,
        maxTicks: ctx.config.maxTicks,
      });
      await ctx.stop();
      return;
    }

    logger.debug('Reactive execution complete', 'StrategyRunner', {
      strategy: ctx.strategyName,
      execution: currentCount,
      triggerToken: payload.tokenId,
      triggerBid: payload.bid,
      triggerAsk: payload.ask,
    });
  } catch (err) {
    const currentCount = ctx.getExecutionCount ? ctx.getExecutionCount() : ctx.executionCount;
    logger.error('Reactive execution error', 'StrategyRunner', {
      err: String(err),
      execution: currentCount,
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
