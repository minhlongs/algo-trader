/**
 * Multi-Regime Candle Generator
 *
 * Deterministic synthetic candle generator capable of producing candle series
 * exhibiting all 7 market regimes:
 * - TREND_UP
 * - TREND_DOWN
 * - RANGE
 * - HIGH_VOLATILITY
 * - LOW_VOLATILITY
 * - SHOCK
 * - UNKNOWN
 */

import type { CandleLike, MarketRegime } from '../regimes/regime-types';
import { shapeRegimeBar } from './multi-regime-candle-shaping';

export interface RegimeSegmentConfig {
  regime: MarketRegime;
  bars: number;
}

export interface MultiRegimeCandleOptions {
  symbol?: string;
  basePrice?: number;
  segments?: RegimeSegmentConfig[];
  startIso?: string;
}

export const DEFAULT_REGIME_SCHEDULE: RegimeSegmentConfig[] = [
  { regime: 'TREND_UP', bars: 40 },
  { regime: 'RANGE', bars: 40 },
  { regime: 'HIGH_VOLATILITY', bars: 40 },
  { regime: 'SHOCK', bars: 25 },
  { regime: 'TREND_DOWN', bars: 40 },
  { regime: 'LOW_VOLATILITY', bars: 40 },
];

/**
 * Generate a synthetic candle series spanning distinct scheduled market regimes.
 */
export function generateMultiRegimeCandles(options?: MultiRegimeCandleOptions): CandleLike[] {
  const basePrice = options?.basePrice ?? 60000;
  const segments = options?.segments ?? DEFAULT_REGIME_SCHEDULE;
  let price = basePrice;
  let timeMs = new Date(options?.startIso ?? '2025-01-01T00:00:00.000Z').getTime();
  const candles: CandleLike[] = [];

  for (const segment of segments) {
    const segCenter = price;
    for (let bar = 0; bar < segment.bars; bar++) {
      const shape = shapeRegimeBar(segment.regime, { price, bar, segCenter });
      const { open, high, low, close, volume } = shape;
      price = shape.nextPrice;

      candles.push({
        timestamp: new Date(timeMs).toISOString(),
        open: Math.round(open * 100) / 100,
        high: Math.round(high * 100) / 100,
        low: Math.round(low * 100) / 100,
        close: Math.round(close * 100) / 100,
        volume: Math.round(volume),
      });

      timeMs += 3600 * 1000; // 1-hour interval
    }
  }

  return candles;
}
