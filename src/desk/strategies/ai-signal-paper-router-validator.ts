/**
 * AI Signal Paper Router Validation and Guard Logic
 */

import { logger } from '../../shared/utils/logger';
import type { AISignal } from './ai-signal-adapter';
import type {
  AISignalPaperRouterConfig,
  SignalRoutingOutcome,
} from './ai-signal-paper-router-types';
import type { AlphaLifecycleStateMachine } from '../../alpha-lab/attribution/alpha-lifecycle-state-machine';

export async function checkSignalPreconditions(
  signal: AISignal,
  marketPrice: number,
  config: AISignalPaperRouterConfig,
  symbol: string,
  timestamp: number,
  isBuy: boolean,
  stateMachineOverride?: AlphaLifecycleStateMachine,
): Promise<{ errorOutcome?: SignalRoutingOutcome }> {
  // Strategy Lifecycle State Inspection: Block signals if strategy is QUARANTINED or RETIRED
  const sm = stateMachineOverride ??
    (signal.strategyId ? config.stateMachines?.get(signal.strategyId) : undefined) ??
    config.stateMachine;
  const state = sm ? sm.getState() : (signal.strategyId ? config.getState?.(signal.strategyId) : undefined);

  if (state === 'QUARANTINED' || state === 'RETIRED') {
    const reason = state === 'QUARANTINED'
      ? 'Strategy is quarantined by drawdown circuit breaker'
      : 'Strategy is in RETIRED state: Strategy is quarantined by drawdown circuit breaker';
    logger.warn(`[AISignalPaperRouter] Signal blocked for ${signal.strategyId ?? 'unknown'}: ${reason}`);
    return {
      errorOutcome: {
        status: 'REJECTED',
        signal,
        symbol,
        marketPrice,
        validation: { valid: false, signal, rejectionReasons: [reason] },
        reason,
        timestamp,
      },
    };
  }

  const validation = config.adapter.validateSignal(signal);
  if (!validation.valid) {
    const identifier = signal.strategyId ?? signal.signalId ?? 'unknown';
    logger.info(`[AISignalPaperRouter] Signal validation rejected for ${identifier}: ${validation.rejectionReasons.join('; ')}`);
    return {
      errorOutcome: {
        status: 'REJECTED',
        signal,
        symbol,
        marketPrice,
        validation,
        reason: `Validation failed: ${validation.rejectionReasons.join('; ')}`,
        timestamp,
      },
    };
  }

  if (typeof marketPrice !== 'number' || !Number.isFinite(marketPrice) || marketPrice <= 0) {
    logger.warn(`[AISignalPaperRouter] Invalid marketPrice: ${marketPrice} for ${symbol}`);
    return {
      errorOutcome: {
        status: 'REJECTED',
        signal,
        symbol,
        marketPrice,
        validation,
        reason: 'Invalid marketPrice: must be a positive finite number',
        timestamp,
      },
    };
  }

  if (config.drawdownBreaker && !config.drawdownBreaker.canOpenNewTrades() && isBuy) {
    const tier = config.drawdownBreaker.getState().tier;
    logger.warn(`[AISignalPaperRouter] Signal blocked by circuit breaker (Tier: ${tier})`);
    return {
      errorOutcome: {
        status: 'REJECTED',
        signal,
        symbol,
        marketPrice,
        validation,
        reason: `Circuit breaker active (${tier})`,
        timestamp,
      },
    };
  }

  if (config.circuitBreaker && isBuy) {
    const canTrade = await config.circuitBreaker.canTrade();
    if (!canTrade) {
      const status = await config.circuitBreaker.getStatus();
      logger.warn(`[AISignalPaperRouter] Signal blocked by risk circuit breaker (${status.reason ?? status.state})`);
      return {
        errorOutcome: {
          status: 'REJECTED',
          signal,
          symbol,
          marketPrice,
          validation,
          reason: `Risk circuit breaker active: ${status.reason ?? status.state}`,
          timestamp,
        },
      };
    }
  }

  return {};
}
