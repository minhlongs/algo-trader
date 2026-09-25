/**
 * AI Signal Paper Router Dispatcher
 */

import { logger } from '../../shared/utils/logger';
import { sizeSignalToTradeSignal } from '../risk/regime-aware-kelly';
import type { TradeSignal } from '../execution/paper-position-types';
import type { AISignal } from './ai-signal-adapter';
import type {
  AISignalPaperRouterConfig,
  SignalRoutingOutcome,
} from './ai-signal-paper-router-types';
import type { PaperEquityTracker } from './ai-signal-paper-router-tracker';
import { mapExecutionToFillRecord } from '../execution/paper-position-types';

export async function dispatchSignalOrder(
  signal: AISignal,
  marketPrice: number,
  config: AISignalPaperRouterConfig,
  tracker: PaperEquityTracker,
): Promise<SignalRoutingOutcome> {
  const symbol = signal.symbol ?? config.defaultSymbol ?? 'BTC/USDT';
  const timestamp = Date.now();
  const isBuy = signal.direction === 'BUY' || signal.action === 'BUY';

  const validation = config.adapter.validateSignal(signal);
  if (!validation.valid) {
    const identifier = signal.strategyId ?? signal.signalId ?? 'unknown';
    logger.info(
      `[AISignalPaperRouter] Signal validation rejected for ${identifier}: ${validation.rejectionReasons.join('; ')}`,
    );
    return {
      status: 'REJECTED',
      signal,
      symbol,
      marketPrice,
      validation,
      reason: `Validation failed: ${validation.rejectionReasons.join('; ')}`,
      timestamp,
    };
  }

  if (typeof marketPrice !== 'number' || !Number.isFinite(marketPrice) || marketPrice <= 0) {
    logger.warn(`[AISignalPaperRouter] Invalid marketPrice: ${marketPrice} for ${symbol}`);
    return {
      status: 'REJECTED',
      signal,
      symbol,
      marketPrice,
      validation,
      reason: 'Invalid marketPrice: must be a positive finite number',
      timestamp,
    };
  }

  if (config.drawdownBreaker && !config.drawdownBreaker.canOpenNewTrades() && isBuy) {
    const tier = config.drawdownBreaker.getState().tier;
    logger.warn(`[AISignalPaperRouter] Signal blocked by circuit breaker (Tier: ${tier})`);
    return {
      status: 'REJECTED',
      signal,
      symbol,
      marketPrice,
      validation,
      reason: `Circuit breaker active (${tier})`,
      timestamp,
    };
  }

  let tradeSignal: TradeSignal;
  if (isBuy) {
    const pnlSummary = config.paperExecutor.getPnlSummary();
    const positions = config.paperExecutor.getPositions();
    const positionValue = positions.reduce((sum, p) => sum + p.quantity * p.currentPrice, 0);
    const currentEquity = pnlSummary.balance + positionValue;
    const sizingEquity = currentEquity > 0 ? currentEquity : 10_000;

    tradeSignal = sizeSignalToTradeSignal(signal, {
      portfolioEquity: sizingEquity,
      currentPrice: marketPrice,
      symbol,
      regimeKelly: config.regimeKelly,
      drawdownBreaker: config.drawdownBreaker,
      defaultWinLossRatio: config.defaultWinLossRatio,
      strictMaxCap: config.strictMaxCap,
      minPositionUsd: config.minPositionUsd,
    });

    if (tradeSignal.quantity <= 0) {
      logger.info(
        `[AISignalPaperRouter] Zero position size allocated for ${symbol} in regime ${signal.regime}`,
      );
      return {
        status: 'ZERO_SIZE',
        signal,
        symbol,
        marketPrice,
        validation,
        tradeSignal,
        reason:
          signal.regime === 'SHOCK'
            ? 'Regime is SHOCK: zero allocation enforced'
            : 'Position sizing returned 0 quantity',
        timestamp,
      };
    }
  } else {
    const positions = config.paperExecutor.getPositions();
    const currentPos = positions.find((p) => p.symbol === symbol);
    if (!currentPos || !Number.isFinite(currentPos.quantity) || currentPos.quantity <= 0) {
      return {
        status: 'REJECTED',
        signal,
        symbol,
        marketPrice,
        validation,
        reason: `Insufficient position: no open long position for ${symbol} to sell`,
        timestamp,
      };
    }
    tradeSignal = {
      symbol,
      side: 'sell',
      quantity: currentPos.quantity,
      price: marketPrice,
    };
  }

  const execResult = await config.paperExecutor.executePaperTrade(tradeSignal, marketPrice);
  if (!execResult.success) {
    const isUnfilled = execResult.message?.includes('not filled') ?? false;
    logger.info(`[AISignalPaperRouter] Trade not executed for ${symbol}: ${execResult.message}`);
    return {
      status: isUnfilled ? 'UNFILLED' : 'REJECTED',
      signal,
      symbol,
      marketPrice,
      validation,
      tradeSignal,
      executionResult: execResult,
      reason: execResult.message,
      timestamp,
    };
  }

  const trade = execResult.trade!;
  const strategyId = signal.strategyId ?? signal.signalId ?? 'unknown';
  const fillRecord = mapExecutionToFillRecord(trade, strategyId);

  tracker.addFillRecord(fillRecord);
  tracker.recordSnapshot();

  logger.info(
    `[AISignalPaperRouter] Order ${trade.side.toUpperCase()} ${trade.quantity} ${symbol} filled @ $${trade.executedPrice.toFixed(2)} (fee: $${trade.fee.toFixed(2)}, slippage: ${fillRecord.slippageBps} bps)`,
  );

  return {
    status: 'FILLED',
    signal,
    symbol,
    marketPrice,
    validation,
    tradeSignal,
    executionResult: execResult,
    fillRecord,
    timestamp,
  };
}
