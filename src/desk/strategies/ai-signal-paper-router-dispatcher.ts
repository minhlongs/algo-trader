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
import type { AlphaLifecycleStateMachine } from '../../alpha-lab/attribution/alpha-lifecycle-state-machine';
import { checkSignalPreconditions } from './ai-signal-paper-router-validator';

export async function dispatchSignalOrder(
  signal: AISignal,
  marketPrice: number,
  config: AISignalPaperRouterConfig,
  tracker: PaperEquityTracker,
  stateMachineOverride?: AlphaLifecycleStateMachine,
): Promise<SignalRoutingOutcome> {
  const symbol = signal.symbol ?? config.defaultSymbol ?? 'BTC/USDT';
  const timestamp = Date.now();
  const isBuy = signal.direction === 'BUY' || signal.action === 'BUY';

  const check = await checkSignalPreconditions(
    signal,
    marketPrice,
    config,
    symbol,
    timestamp,
    isBuy,
    stateMachineOverride,
  );
  if (check.errorOutcome) {
    return check.errorOutcome;
  }

  const validation = config.adapter.validateSignal(signal);

  let tradeSignal: TradeSignal;
  if (isBuy) {
    const pnlSummary = config.paperExecutor.getPnlSummary();
    const positions = config.paperExecutor.getPositions();
    const positionValue = positions.reduce((sum, p) => sum + p.quantity * p.currentPrice, 0);
    const sizingEquity = (pnlSummary.balance + positionValue) > 0 ? (pnlSummary.balance + positionValue) : 10_000;

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
      logger.info(`[AISignalPaperRouter] Zero position size allocated for ${symbol} in regime ${signal.regime}`);
      return {
        status: 'ZERO_SIZE',
        signal,
        symbol,
        marketPrice,
        validation,
        tradeSignal,
        reason: signal.regime === 'SHOCK' ? 'Regime is SHOCK: zero allocation enforced' : 'Position sizing returned 0 quantity',
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
    tradeSignal = { symbol, side: 'sell', quantity: currentPos.quantity, price: marketPrice };
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

  if (config.circuitBreaker && trade.pnl !== undefined && trade.pnl !== 0) {
    if (trade.pnl > 0) void config.circuitBreaker.recordWin();
    else if (trade.pnl < 0) void config.circuitBreaker.recordLoss();
  }

  logger.info(`[AISignalPaperRouter] Order ${trade.side.toUpperCase()} ${trade.quantity} ${symbol} filled @ $${trade.executedPrice.toFixed(2)}`);

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
