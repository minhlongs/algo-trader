/**
 * Candle Perturbation Helpers — Phase 14
 *
 * Deterministic candle transformations for robustness testing:
 *   - dropCandles: randomly drop a fraction of candles
 *   - delayCandles: simulate execution delay by removing leading bars
 */

import type { CandleLike } from '../regimes/regime-types';

/** Deterministic LCG for reproducible random drops. */
function lcg(seed: number): () => number {
  let state = seed & 0x7fffffff;
  return () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state / 0x7fffffff;
  };
}

/** Drop a fraction of candles at random positions, preserving order. */
export function dropCandles(candles: CandleLike[], fraction: number, seed: number): CandleLike[] {
  if (fraction <= 0) return candles;
  const rng = lcg(seed);
  return candles.filter(() => rng() >= fraction);
}

/** Delay entry signals by N bars by removing the first N candles. */
export function delayCandles(candles: CandleLike[], delayBars: number): CandleLike[] {
  if (delayBars <= 0) return candles;
  return candles.slice(delayBars);
}