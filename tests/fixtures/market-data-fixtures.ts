/**
 * Market Data Fixtures for Alpha-Lab Testing
 *
 * Deterministic generation of candles for all 7 market regimes:
 * TREND_UP, TREND_DOWN, RANGE, HIGH_VOLATILITY, LOW_VOLATILITY, SHOCK, UNKNOWN.
 */

import type { CandleLike } from '../../src/alpha-lab/regimes/regime-types';

/** Helper to round to 2 decimal places */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Helper to format ISO UTC timestamps */
function isoTime(index: number, baseDate = '2025-01-01T00:00:00.000Z'): string {
  const d = new Date(baseDate);
  d.setMinutes(d.getMinutes() + index * 60);
  return d.toISOString();
}

/**
 * Generate candles displaying strong positive slope and trend strength (TREND_UP).
 */
export function makeTrendUpCandles(count = 50, startPrice = 50000): CandleLike[] {
  const candles: CandleLike[] = [];
  let price = startPrice;

  for (let i = 0; i < count; i++) {
    const step = 50 + (i % 5) * 5; // Steady upward drift
    const open = price;
    const close = open + step;
    const high = close + 10;
    const low = open - 5;
    const volume = 2000 + (i % 3) * 100;
    candles.push({
      timestamp: isoTime(i),
      open: round2(open),
      high: round2(high),
      low: round2(low),
      close: round2(close),
      volume: round2(volume),
    });
    price = close;
  }
  return candles;
}

/**
 * Generate candles displaying strong negative slope and trend strength (TREND_DOWN).
 */
export function makeTrendDownCandles(count = 50, startPrice = 50000): CandleLike[] {
  const candles: CandleLike[] = [];
  let price = startPrice;

  for (let i = 0; i < count; i++) {
    const step = 50 + (i % 5) * 5; // Steady downward drift
    const open = price;
    const close = open - step;
    const high = open + 5;
    const low = close - 10;
    const volume = 2000 + (i % 3) * 100;
    candles.push({
      timestamp: isoTime(i),
      open: round2(open),
      high: round2(high),
      low: round2(low),
      close: round2(close),
      volume: round2(volume),
    });
    price = close;
  }
  return candles;
}

/**
 * Generate candles oscillating in a defined range (RANGE).
 * returnDispersion is in [0.01, 0.03), trendStrength < 20.
 */
export function makeRangeCandles(count = 50, basePrice = 50000): CandleLike[] {
  const candles: CandleLike[] = [];

  for (let i = 0; i < count; i++) {
    const offset = i % 2 === 0 ? 350 : -350;
    const open = basePrice;
    const close = basePrice + offset;
    const high = basePrice + 500;
    const low = basePrice - 500;
    const volume = 1500;
    candles.push({
      timestamp: isoTime(i),
      open: round2(open),
      high: round2(high),
      low: round2(low),
      close: round2(close),
      volume: round2(volume),
    });
  }
  return candles;
}

/**
 * Generate candles with annualized realized volatility >= 1.0 (HIGH_VOLATILITY).
 */
export function makeHighVolCandles(count = 50, basePrice = 50000): CandleLike[] {
  const candles: CandleLike[] = [];

  for (let i = 0; i < count; i++) {
    const sign = i % 2 === 0 ? 1 : -1;
    const move = sign * 4000;
    const open = basePrice;
    const close = open + move;
    const high = Math.max(open, close) + 1000;
    const low = Math.min(open, close) - 1000;
    const volume = 2500;
    candles.push({
      timestamp: isoTime(i),
      open: round2(open),
      high: round2(high),
      low: round2(low),
      close: round2(close),
      volume: round2(volume),
    });
  }
  return candles;
}

/**
 * Generate candles with very small swings and tight compression (LOW_VOLATILITY).
 * realizedVol < 0.4 && trendStrength < 20 && returnDispersion < 0.01
 */
export function makeLowVolCandles(count = 50, basePrice = 50000): CandleLike[] {
  const candles: CandleLike[] = [];

  for (let i = 0; i < count; i++) {
    const offset = i % 2 === 0 ? 0.5 : -0.5;
    const open = basePrice;
    const close = basePrice + offset;
    const high = basePrice + 1.0;
    const low = basePrice - 1.0;
    const volume = 800;
    candles.push({
      timestamp: isoTime(i),
      open: round2(open),
      high: round2(high),
      low: round2(low),
      close: round2(close),
      volume: round2(volume),
    });
  }
  return candles;
}

/**
 * Generate candles with an abrupt volume explosion and gap expansion (SHOCK).
 */
export function makeShockCandles(count = 50, basePrice = 50000): CandleLike[] {
  const candles: CandleLike[] = [];
  const shockStart = Math.max(0, count - 6);
  for (let i = 0; i < shockStart; i++) {
    candles.push({
      timestamp: isoTime(i),
      open: basePrice,
      high: basePrice + 10,
      low: basePrice - 10,
      close: basePrice + 1,
      volume: 1000,
    });
  }
  // Sudden extreme volatility swing over last several candles to ensure returnDispersion > 0.05
  const multipliers = [1.15, 0.85, 1.20, 0.80, 1.15, 0.85];
  let curr = basePrice;
  for (let i = shockStart; i < count; i++) {
    const mult = multipliers[(i - shockStart) % multipliers.length]!;
    const next = Math.round(curr * mult);
    candles.push({
      timestamp: isoTime(i),
      open: round2(curr),
      high: round2(Math.max(curr, next) * 1.05),
      low: round2(Math.min(curr, next) * 0.95),
      close: round2(next),
      volume: i === count - 1 ? 60000 : 30000,
    });
    curr = next;
  }
  return candles;
}

/**
 * Generate concatenated multi-regime series.
 */
export function makeMultiRegimeCandles(): { candles: CandleLike[]; regimeLabels: string[] } {
  const up = makeTrendUpCandles(30, 40000);
  const highVol = makeHighVolCandles(25, 45000);
  const shock = makeShockCandles(20, 43000);
  const range = makeRangeCandles(30, 42000);
  const down = makeTrendDownCandles(30, 42000);

  const allCandles = [...up, ...highVol, ...shock, ...range, ...down].map((c, idx) => ({
    ...c,
    timestamp: isoTime(idx),
  }));

  return {
    candles: allCandles,
    regimeLabels: ['TREND_UP', 'HIGH_VOLATILITY', 'SHOCK', 'RANGE', 'TREND_DOWN'],
  };
}
