/**
 * Regime-Adaptive Momentum - Signal Evaluation Helpers
 */

import type { RawOrderBook } from '../../polymarket/clob-client';
import type { OpenPosition } from './base-polymarket-strategy';
import { calcSMA, calcATR } from './strategy-math-helpers';
import type {
  Regime,
  RegimeAdaptiveMomentumConfig,
} from './regime-adaptive-momentum-types';
import {
  detectRegime,
  calcPullbackDepth,
  calcOBI,
  calcTrendDirection,
  getRegimeTpPct,
  getRegimeSizeMultiplier,
} from './regime-adaptive-momentum-math';

export interface RegimeEntrySignal {
  regime: Regime;
  trendDir: 'up' | 'down';
  side: 'yes' | 'no';
  sizeMultiplier: number;
}

export function evaluateRegimeExit(
  pos: OpenPosition,
  currentPrice: number,
  now: number,
  entryRegime: Regime,
  shortPrices: number[],
  longPrices: number[],
  cfg: RegimeAdaptiveMomentumConfig
): { shouldExit: boolean; reason: string } {
  const gain = pos.side === 'yes'
    ? (currentPrice - pos.entryPrice) / pos.entryPrice
    : (pos.entryPrice - currentPrice) / pos.entryPrice;

  const regimeTp = getRegimeTpPct(entryRegime, cfg);

  if (gain >= regimeTp) {
    return { shouldExit: true, reason: `take-profit (${(gain * 100).toFixed(2)}%)` };
  } else if (-gain >= cfg.stopLossPct) {
    return { shouldExit: true, reason: `stop-loss (${(gain * 100).toFixed(2)}%)` };
  } else if (now - pos.openedAt > cfg.maxHoldMs) {
    return { shouldExit: true, reason: 'max hold time' };
  }

  // Regime shift exit: regime changed AND trend reversed against position
  if (shortPrices.length >= 2 && longPrices.length >= 2) {
    const currentRegime = detectRegime(shortPrices, longPrices, cfg.trendThreshold, cfg.volatileAtrRatio);
    const smaShort = calcSMA(shortPrices);
    const smaLong = calcSMA(longPrices);
    const currentDir = calcTrendDirection(smaShort, smaLong);

    if (currentRegime !== entryRegime) {
      const againstPosition =
        (pos.side === 'yes' && currentDir === 'down') ||
        (pos.side === 'no' && currentDir === 'up');
      if (againstPosition) {
        return {
          shouldExit: true,
          reason: `regime shift (${entryRegime} → ${currentRegime}) + trend reversal`,
        };
      }
    }
  }

  return { shouldExit: false, reason: '' };
}

export function evaluateRegimeEntrySignal(
  shortPrices: number[],
  longPrices: number[],
  currentPrice: number,
  book: RawOrderBook,
  cfg: RegimeAdaptiveMomentumConfig
): RegimeEntrySignal | null {
  const regime = detectRegime(shortPrices, longPrices, cfg.trendThreshold, cfg.volatileAtrRatio);
  const smaShort = calcSMA(shortPrices);
  const smaLong = calcSMA(longPrices);
  const trendDir = calcTrendDirection(smaShort, smaLong);

  let side: 'yes' | 'no' | null = null;

  if (regime === 'trending') {
    const depth = calcPullbackDepth(shortPrices, currentPrice);
    if (depth <= cfg.trendingPullbackPct && currentPrice > smaLong) {
      side = trendDir === 'up' ? 'yes' : 'no';
    }
  } else if (regime === 'ranging') {
    const obi = calcOBI(book);
    if (obi > cfg.obiEntryThreshold) side = 'yes';
    else if (obi < 1 / cfg.obiEntryThreshold) side = 'no';
  } else if (regime === 'volatile') {
    const atrLong = calcATR(longPrices);
    const trendStrength = atrLong > 0 ? Math.abs(smaShort - smaLong) / atrLong : 0;
    if (trendStrength > 2.0) {
      const depth = calcPullbackDepth(shortPrices, currentPrice);
      if (depth <= cfg.volatilePullbackPct && currentPrice > smaLong) {
        side = trendDir === 'up' ? 'yes' : 'no';
      }
    }
  }

  if (!side) return null;

  return {
    regime,
    trendDir,
    side,
    sizeMultiplier: getRegimeSizeMultiplier(regime),
  };
}
