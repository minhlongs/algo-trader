/**
 * AISignal to TradeSignal Sizing Logic
 */

import type { AISignal } from '../strategies/ai-signal-adapter';
import type { TradeSignal } from '../execution/paper-position-types';
import { RegimeAwareKelly } from './regime-aware-kelly-class';
import type { SizeSignalOptions } from './regime-aware-kelly-types';

export function sizeSignalToTradeSignal(
  signal: AISignal,
  options: SizeSignalOptions,
): TradeSignal {
  const isBuy = signal.direction === 'BUY' || signal.action === 'BUY';
  const side: 'buy' | 'sell' = isBuy ? 'buy' : 'sell';
  const symbol = signal.symbol ?? options.symbol ?? 'BTC/USDT';

  if (!Number.isFinite(options.currentPrice) || options.currentPrice <= 0) {
    return { symbol, side, quantity: 0, price: options.currentPrice };
  }
  if (!Number.isFinite(options.portfolioEquity) || options.portfolioEquity <= 0) {
    return { symbol, side, quantity: 0, price: options.currentPrice };
  }

  // SHOCK regime strictly enforces flat allocation (0 quantity)
  if (signal.regime === 'SHOCK') {
    return { symbol, side, quantity: 0, price: options.currentPrice };
  }

  // Guard with TieredDrawdownBreaker.canOpenNewTrades()
  if (options.drawdownBreaker && !options.drawdownBreaker.canOpenNewTrades()) {
    return { symbol, side, quantity: 0, price: options.currentPrice };
  }

  // Guard against invalid confidence or zero/negative expectancy
  const p = signal.confidence;
  if (
    typeof p !== 'number' ||
    !Number.isFinite(p) ||
    p <= 0 ||
    p >= 1 ||
    typeof signal.expectancy !== 'number' ||
    !Number.isFinite(signal.expectancy) ||
    signal.expectancy <= 0
  ) {
    return { symbol, side, quantity: 0, price: options.currentPrice };
  }

  // Win/loss ratio: b = (signal.expectancy + 1 - signal.confidence) / signal.confidence
  let b = (signal.expectancy + 1 - p) / p;
  if (!Number.isFinite(b) || b <= 0) {
    b = options.defaultWinLossRatio ?? 1.5;
  }

  const sizer =
    options.regimeKelly ??
    new RegimeAwareKelly({
      kelly: { kellyFraction: 0.25, maxPositionFraction: 0.05 },
      regimeMultipliers: {},
      unknownRegimeMultiplier: 0.75,
    });

  const sizingResult = sizer.size(
    {
      winProbability: p,
      winLossRatio: b,
      portfolioValue: options.portfolioEquity,
    },
    signal.regime,
  );

  const ddMultiplier = options.drawdownBreaker
    ? options.drawdownBreaker.getSizingMultiplier()
    : 1.0;
  let allocatedCapitalUsd = sizingResult.positionSizeUsd * ddMultiplier;

  if (!Number.isFinite(allocatedCapitalUsd) || allocatedCapitalUsd < 0) {
    allocatedCapitalUsd = 0;
  }

  // Strict 5% portfolio equity cap enforcement
  if (options.strictMaxCap !== false) {
    allocatedCapitalUsd = Math.min(allocatedCapitalUsd, options.portfolioEquity * 0.05);
  }

  const minPositionUsd = options.minPositionUsd ?? 1.0;
  if (allocatedCapitalUsd < minPositionUsd) {
    allocatedCapitalUsd = 0;
  }

  const allocatedFraction =
    options.portfolioEquity > 0 ? allocatedCapitalUsd / options.portfolioEquity : 0;

  const rawQuantity =
    options.currentPrice > 0
      ? Math.floor(((options.portfolioEquity * allocatedFraction) / options.currentPrice) * 1e8) / 1e8
      : 0;

  const quantity = Number.isFinite(rawQuantity) && rawQuantity > 0 ? rawQuantity : 0;

  return {
    symbol,
    side,
    quantity,
    price: options.currentPrice,
  };
}
