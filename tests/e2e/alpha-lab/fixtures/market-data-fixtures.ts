/**
 * Market Data Fixtures for Alpha-Lab E2E Testing
 * Deterministic generation of candles for all 7 market regimes:
 * TREND_UP, TREND_DOWN, RANGE, HIGH_VOLATILITY, LOW_VOLATILITY, SHOCK, UNKNOWN.
 */

import type { CandleLike } from '../../../../src/alpha-lab/regimes/regime-types';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function isoTime(index: number, baseDate = '2025-01-01T00:00:00.000Z'): string {
  const d = new Date(baseDate);
  d.setMinutes(d.getMinutes() + index * 60);
  return d.toISOString();
}

/** Generate candles displaying strong positive slope and trend strength (TREND_UP). */
export function makeTrendUpCandles(count = 50, startPrice = 50000): CandleLike[] {
  const candles: CandleLike[] = [];
  let price = startPrice;
  for (let i = 0; i < count; i++) {
    const step = 50 + (i % 5) * 5;
    const open = price;
    const close = open + step;
    candles.push({
      timestamp: isoTime(i),
      open: round2(open),
      high: round2(close + 10),
      low: round2(open - 5),
      close: round2(close),
      volume: round2(2000 + (i % 3) * 100),
    });
    price = close;
  }
  return candles;
}

/** Generate candles displaying strong negative slope and trend strength (TREND_DOWN). */
export function makeTrendDownCandles(count = 50, startPrice = 50000): CandleLike[] {
  const candles: CandleLike[] = [];
  let price = startPrice;
  for (let i = 0; i < count; i++) {
    const step = 50 + (i % 5) * 5;
    const open = price;
    const close = open - step;
    candles.push({
      timestamp: isoTime(i),
      open: round2(open),
      high: round2(open + 5),
      low: round2(close - 10),
      close: round2(close),
      volume: round2(2000 + (i % 3) * 100),
    });
    price = close;
  }
  return candles;
}

/** Generate candles oscillating in a defined range (RANGE). */
export function makeRangeCandles(count = 50, basePrice = 50000): CandleLike[] {
  const candles: CandleLike[] = [];
  for (let i = 0; i < count; i++) {
    const offset = i % 2 === 0 ? 350 : -350;
    candles.push({
      timestamp: isoTime(i),
      open: round2(basePrice),
      high: round2(basePrice + 500),
      low: round2(basePrice - 500),
      close: round2(basePrice + offset),
      volume: 1500,
    });
  }
  return candles;
}

/** Generate candles with annualized realized volatility >= 1.0 (HIGH_VOLATILITY). */
export function makeHighVolCandles(count = 50, basePrice = 50000): CandleLike[] {
  const candles: CandleLike[] = [];
  for (let i = 0; i < count; i++) {
    const sign = i % 2 === 0 ? 1 : -1;
    const open = basePrice;
    const close = open + sign * 4000;
    candles.push({
      timestamp: isoTime(i),
      open: round2(open),
      high: round2(Math.max(open, close) + 1000),
      low: round2(Math.min(open, close) - 1000),
      close: round2(close),
      volume: 2500,
    });
  }
  return candles;
}

/** Generate candles with small swings and tight compression (LOW_VOLATILITY). */
export function makeLowVolCandles(count = 50, basePrice = 50000): CandleLike[] {
  const candles: CandleLike[] = [];
  for (let i = 0; i < count; i++) {
    const offset = i % 2 === 0 ? 0.5 : -0.5;
    candles.push({
      timestamp: isoTime(i),
      open: round2(basePrice),
      high: round2(basePrice + 1.0),
      low: round2(basePrice - 1.0),
      close: round2(basePrice + offset),
      volume: 800,
    });
  }
  return candles;
}

/** Generate candles with abrupt volume explosion and gap expansion (SHOCK). */
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

/** Generate concatenated multi-regime series. */
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
