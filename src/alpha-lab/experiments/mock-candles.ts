/**
 * Mock Candle Generator
 *
 * Deterministic-ish random-walk candle generator used only as a fallback
 * when no real OHLCV data is available yet (e.g. before the Binance backfill
 * has run, or in offline/local runs).
 *
 * CRITICAL: results produced from mock candles are NOT evidence of real
 * profitability. Experiment artifacts must record `source: 'mock'` so no
 * one mistakes them for out-of-sample evidence.
 */

import type { CandleLike } from '../regimes/regime-types';

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Generate a random-walk candle sequence.
 *
 * @param symbol  Used to pick a sensible base price (BTC ~$60k, ETH ~$3.5k, else ~$150)
 * @param count   Number of candles to generate
 * @param seed    Optional seed for reproducibility (not cryptographically strong —
 *                just enough to make a re-run deterministic when debugging)
 */
export function generateMockCandles(
  symbol: string,
  count: number,
  seed?: number,
): CandleLike[] {
  const basePrice = symbol.includes('BTC')
    ? 60000
    : symbol.includes('ETH')
      ? 3500
      : 150;
  const candles: CandleLike[] = [];
  let price = basePrice;
  let state = seed ?? 12345;

  for (let i = 0; i < count; i++) {
    // Simple LCG so seeded runs are reproducible
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    const r = state / 0x7fffffff; // 0..1
    const drift = (r - 0.48) * basePrice * 0.008;
    const open = price;
    const close = open + drift;
    const high = Math.max(open, close) + Math.abs(drift) * 0.3;
    const low = Math.min(open, close) - Math.abs(drift) * 0.3;
    const volume = 1000 + r * 5000;

    candles.push({
      timestamp: new Date(Date.UTC(2025, 0, 1, i)).getTime(),
      open: round(open),
      high: round(high),
      low: round(low),
      close: round(close),
      volume: round(volume),
    });

    price = close;
  }
  return candles;
}