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
      let open = price;
      let close = price;
      let high = price;
      let low = price;
      let volume = 1000;

      switch (segment.regime) {
        case 'TREND_UP': {
          // Strong directional upward trend: +0.6% per bar, high=close, low=open
          const step = price * 0.006;
          open = price;
          close = open + step;
          high = close * 1.001;
          low = open * 0.999;
          volume = 1200;
          price = close;
          break;
        }
        case 'TREND_DOWN': {
          // Strong directional downward trend: -0.6% per bar, high=open, low=close
          const step = price * 0.006;
          open = price;
          close = Math.max(100, open - step);
          high = open * 1.001;
          low = close * 0.999;
          volume = 1200;
          price = close;
          break;
        }
        case 'RANGE': {
          // Channel oscillation around segCenter: +/- 1.0%, high/low fixed at bounds so trendStrength = 0
          const delta = (bar % 2 === 0 ? 1 : -1) * segCenter * 0.01;
          open = segCenter;
          close = segCenter + delta;
          high = segCenter + segCenter * 0.015;
          low = segCenter - segCenter * 0.015;
          volume = 1000;
          price = close;
          break;
        }
        case 'HIGH_VOLATILITY': {
          // Extreme alternating swings: +/- 6.5% per bar -> realized vol > 1.0 annualized
          const delta = (bar % 2 === 0 ? 1 : -1) * price * 0.065;
          open = price;
          close = Math.max(100, open + delta);
          high = Math.max(open, close) + Math.abs(delta) * 0.3;
          low = Math.min(open, close) - Math.abs(delta) * 0.3;
          volume = 1500;
          price = close;
          break;
        }
        case 'LOW_VOLATILITY': {
          // Tiny channel variance: +/- 0.02% around segCenter -> realized vol < 0.4, dispersion < 0.01, trend = 0
          const delta = (bar % 2 === 0 ? 1 : -1) * segCenter * 0.0002;
          open = segCenter;
          close = segCenter + delta;
          high = segCenter + segCenter * 0.0005;
          low = segCenter - segCenter * 0.0005;
          volume = 800;
          price = close;
          break;
        }
        case 'SHOCK': {
          // Sudden 20% jump and 20x volume spike -> volumeAbnormality > 3 and returnDispersion > 0.05
          if (bar < 5) {
            open = price;
            close = open;
            high = open + 1;
            low = open - 1;
            volume = 500;
            price = close;
          } else {
            const jump = (bar % 2 === 0 ? 1 : -0.8) * price * 0.15;
            open = price;
            close = open + jump;
            high = Math.max(open, close) + 50;
            low = Math.min(open, close) - 50;
            volume = 20000;
            price = close;
          }
          break;
        }
        case 'UNKNOWN':
        default: {
          open = price;
          close = price;
          high = price;
          low = price;
          volume = 100;
          price = close;
          break;
        }
      }

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
