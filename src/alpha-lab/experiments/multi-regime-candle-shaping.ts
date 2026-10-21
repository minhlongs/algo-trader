/**
 * Multi-Regime Candle Shaping
 *
 * Per-regime OHLCV shaping for the deterministic multi-regime candle generator.
 * Each shaper produces one bar's open/high/low/close/volume and returns the
 * resulting price so the caller can carry it into the next bar.
 *
 * Invariants encoded by these shapings (asserted by the regime series tests):
 * - TREND_UP/DOWN: monotone directional drift (+/- 0.6% per bar).
 * - RANGE / LOW_VOLATILITY: oscillation around the segment center so the
 *   fitted trend slope is ~0.
 * - HIGH_VOLATILITY: alternating +/- 6.5% swings produce annualized realized
 *   vol > 1.0.
 * - SHOCK: flat warmup for the first 5 bars, then a ~15% jump with a 20x
 *   volume spike so volume abnormality exceeds 3.
 * - UNKNOWN: flat bars at the current price.
 */

import type { MarketRegime } from '../regimes/regime-types';

/** OHLCV shape for a single bar plus the price to carry into the next bar. */
export interface RegimeBarShape {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  nextPrice: number;
}

/** Context a regime shaper needs to produce one bar. */
export interface RegimeBarContext {
  /** Price carried over from the previous bar (entry price for this bar). */
  price: number;
  /** 0-based index of this bar within its segment. */
  bar: number;
  /** Price at the start of the current segment (channel center for oscillators). */
  segCenter: number;
}

/** Shape one bar for the given regime, returning OHLCV and the next price. */
export function shapeRegimeBar(regime: MarketRegime, ctx: RegimeBarContext): RegimeBarShape {
  switch (regime) {
    case 'TREND_UP': {
      // Strong directional upward trend: +0.6% per bar, high=close, low=open
      const step = ctx.price * 0.006;
      const open = ctx.price;
      const close = open + step;
      return {
        open,
        high: close * 1.001,
        low: open * 0.999,
        close,
        volume: 1200,
        nextPrice: close,
      };
    }
    case 'TREND_DOWN': {
      // Strong directional downward trend: -0.6% per bar, high=open, low=close
      const step = ctx.price * 0.006;
      const open = ctx.price;
      const close = Math.max(100, open - step);
      return {
        open,
        high: open * 1.001,
        low: close * 0.999,
        close,
        volume: 1200,
        nextPrice: close,
      };
    }
    case 'RANGE': {
      // Channel oscillation around segCenter: +/- 1.0%, high/low fixed at bounds so trendStrength = 0
      const delta = (ctx.bar % 2 === 0 ? 1 : -1) * ctx.segCenter * 0.01;
      const open = ctx.segCenter;
      const close = ctx.segCenter + delta;
      return {
        open,
        high: ctx.segCenter + ctx.segCenter * 0.015,
        low: ctx.segCenter - ctx.segCenter * 0.015,
        close,
        volume: 1000,
        nextPrice: close,
      };
    }
    case 'HIGH_VOLATILITY': {
      // Extreme alternating swings: +/- 6.5% per bar -> realized vol > 1.0 annualized
      const delta = (ctx.bar % 2 === 0 ? 1 : -1) * ctx.price * 0.065;
      const open = ctx.price;
      const close = Math.max(100, open + delta);
      return {
        open,
        high: Math.max(open, close) + Math.abs(delta) * 0.3,
        low: Math.min(open, close) - Math.abs(delta) * 0.3,
        close,
        volume: 1500,
        nextPrice: close,
      };
    }
    case 'LOW_VOLATILITY': {
      // Tiny channel variance: +/- 0.02% around segCenter -> realized vol < 0.4, dispersion < 0.01, trend = 0
      const delta = (ctx.bar % 2 === 0 ? 1 : -1) * ctx.segCenter * 0.0002;
      const open = ctx.segCenter;
      const close = ctx.segCenter + delta;
      return {
        open,
        high: ctx.segCenter + ctx.segCenter * 0.0005,
        low: ctx.segCenter - ctx.segCenter * 0.0005,
        close,
        volume: 800,
        nextPrice: close,
      };
    }
    case 'SHOCK': {
      // Sudden 20% jump and 20x volume spike -> volumeAbnormality > 3 and returnDispersion > 0.05
      if (ctx.bar < 5) {
        const open = ctx.price;
        return {
          open,
          high: open + 1,
          low: open - 1,
          close: open,
          volume: 500,
          nextPrice: open,
        };
      }
      const jump = (ctx.bar % 2 === 0 ? 1 : -0.8) * ctx.price * 0.15;
      const open = ctx.price;
      const close = open + jump;
      return {
        open,
        high: Math.max(open, close) + 50,
        low: Math.min(open, close) - 50,
        close,
        volume: 20000,
        nextPrice: close,
      };
    }
    case 'UNKNOWN':
    default: {
      const open = ctx.price;
      return {
        open,
        high: open,
        low: open,
        close: open,
        volume: 100,
        nextPrice: open,
      };
    }
  }
}
