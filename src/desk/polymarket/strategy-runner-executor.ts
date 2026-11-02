/**
 * Price update execution logic and tick processing for StrategyRunner.
 *
 * @module desk/polymarket/strategy-runner-executor
 */

import { logger } from '@shared/utils/logger';
import type { PriceUpdatePayload } from '../events/trading-event-bus';
import type { BasePolymarketStrategy, StrategyDeps } from '@desk/strategies/polymarket/base-polymarket-strategy';
import { clobClient } from './clob-client';
import { GammaClientImpl } from './strategy-runner-types';
import type { LiveOrderManagerProxy } from './live-order-manager-proxy';

export interface StrategyExecutionContext {
  status: 'stopped' | 'running' | 'error';
  getStatus?: () => 'stopped' | 'running' | 'error';
  strategy: BasePolymarketStrategy | null;
  getStrategy?: () => BasePolymarketStrategy | null;
  strategyName: string;
  minExecutionIntervalMs: number;
  maxTicks?: number;
  trackedTokens: Set<string>;
  lastExecutionTime: number;
  getLastExecutionTime?: () => number;
  executionCount: number;
  getExecutionCount?: () => number;
  updateLastExecutionTime: (time: number) => void;
  incrementExecutionCount: () => void;
  executeTick?: () => Promise<void>;
  stop: () => Promise<void>;
}

export function deriveStrategyName(strategyClass: { name: string }): string {
  return strategyClass.name
    .replace(/Strategy$/, '')
    .replace(/([A-Z])/g, '-$1')
    .toLowerCase()
    .replace(/^-/, '');
}

export function createRunnerStrategyDeps(
  proxy: LiveOrderManagerProxy,
  overrides?: Partial<StrategyDeps>,
): StrategyDeps {
  return {
    clob: overrides?.clob ?? clobClient,
    orderManager: overrides?.orderManager ?? proxy,
    eventBus: overrides?.eventBus ?? { emit: () => {}, on: () => {}, off: () => {} },
    gamma: overrides?.gamma ?? new GammaClientImpl(),
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
  const status = ctx.getStatus ? ctx.getStatus() : ctx.status;
  const strategy = ctx.getStrategy ? ctx.getStrategy() : ctx.strategy;
  if (status !== 'running' || !strategy) return;

  const now = Date.now();
  const lastExec = ctx.getLastExecutionTime ? ctx.getLastExecutionTime() : ctx.lastExecutionTime;
  if (now - lastExec < ctx.minExecutionIntervalMs) return;

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
    if (ctx.maxTicks && currentCount >= ctx.maxTicks) {
      logger.info('Max ticks reached', 'StrategyRunner', { strategy: ctx.strategyName });
      await ctx.stop();
    }
    logger.debug('Execution complete', 'StrategyRunner', { execution: currentCount });
  } catch (err) {
    logger.error('Execution error', 'StrategyRunner', { err: String(err) });
  }
}
