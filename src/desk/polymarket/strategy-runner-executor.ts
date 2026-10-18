/**
 * Price update execution logic and tick processing for StrategyRunner.
 *
 * @module desk/polymarket/strategy-runner-executor
 */

import { logger } from '@shared/utils/logger';
import type { PriceUpdatePayload } from '../events/trading-event-bus';
import type { BasePolymarketStrategy, StrategyDeps } from '@desk/strategies/polymarket/base-polymarket-strategy';
import type { LiveOrderManagerProxy } from './live-order-manager-proxy';

export interface StrategyExecutionContext {
  status: 'stopped' | 'running' | 'error';
  strategy: BasePolymarketStrategy | null;
  strategyName: string;
  minExecutionIntervalMs: number;
  maxTicks?: number;
  trackedTokens: Set<string>;
  lastExecutionTime: number;
  executionCount: number;
  updateLastExecutionTime: (time: number) => void;
  incrementExecutionCount: () => void;
  stop: () => Promise<void>;
}

export function deriveStrategyName(strategyClass: { name: string }): string {
  return strategyClass.name
    .replace(/Strategy$/, '')
    .replace(/([A-Z])/g, '-$1')
    .toLowerCase()
    .replace(/^-/, '');
}

export function createRunnerStrategyDeps(proxy: LiveOrderManagerProxy): StrategyDeps {
  return {
    clob: null as unknown as StrategyDeps['clob'],
    orderManager: proxy,
    eventBus: { emit: () => {}, on: () => {}, off: () => {} },
    gamma: null as unknown as StrategyDeps['gamma'],
  };
}

export function createTickTriggerPayload(): PriceUpdatePayload {
  return { tokenId: 'tick-trigger', bid: 0, ask: 0, timestamp: Date.now() };
}

export function startHealthCheckTimer(
  isRunning: () => boolean,
  strategyName: string,
  getExecutions: () => number,
): NodeJS.Timeout {
  const timer = setInterval(() => {
    if (!isRunning()) return;
    logger.debug('Health check', 'StrategyRunner', { strategy: strategyName, executions: getExecutions() });
  }, 60_000);
  timer.unref();
  return timer;
}

export function clearRunnerTimers(
  healthCheckTimer: NodeJS.Timeout | null,
  tickTimer: NodeJS.Timeout | null,
): void {
  if (healthCheckTimer) clearInterval(healthCheckTimer);
  if (tickTimer) clearInterval(tickTimer);
}

export async function processPriceUpdate(
  ctx: StrategyExecutionContext,
  payload: PriceUpdatePayload,
): Promise<void> {
  if (ctx.status !== 'running' || !ctx.strategy) return;
  const now = Date.now();
  if (now - ctx.lastExecutionTime < ctx.minExecutionIntervalMs) return;
  const isRelevant = ctx.trackedTokens.size === 0 || ctx.trackedTokens.has(payload.tokenId);
  if (!isRelevant) return;

  ctx.updateLastExecutionTime(now);
  try {
    ctx.incrementExecutionCount();
    await ctx.strategy.execute();
    if (ctx.maxTicks && ctx.executionCount >= ctx.maxTicks) {
      logger.info('Max ticks reached', 'StrategyRunner', { strategy: ctx.strategyName });
      await ctx.stop();
    }
    logger.debug('Execution complete', 'StrategyRunner', { execution: ctx.executionCount });
  } catch (err) {
    logger.error('Execution error', 'StrategyRunner', { err: String(err) });
  }
}
