/**
 * Microstructure Indicator Suite
 *
 * Computes Order-Book Imbalance (OBI) and VWAP from per-candle volume profile.
 * These signals are only meaningful on short TFs (1m, 5m); on higher TFs the
 * fields return null to make the absence explicit (not zero / not stale).
 *
 * Cheetahclaws-DNA:
 *  - Legibility  : `obi > 0.2` reads as "more bids than asks by 20%" — obvious.
 *  - Explicitness: short-TF-only behavior is encoded via typed null, not via
 *                 magic "skip this field" comments.
 *  - Tractability: inputs are candle arrays; the function is a pure map — easy
 *                 to unit-test, replay.
 */

import { Candle, MicroStructureIndicators, TfId } from './multi-tf-types.js';

// Only these TFs have meaningful microstructure data.
const MICRO_TFS: TfId[] = ['1m', '5m'];

export function isMicroTf(tf: TfId): boolean {
  return MICRO_TFS.includes(tf);
}

/**
 * Compute OBI from a snapshot of bids/asks.
 * Pass the order book as bidVol / askVol; function is pure and deterministic.
 */
export function computeOBI(bidVol: number, askVol: number): number {
  const total = bidVol + askVol;
  if (total === 0) return 0;
  return (bidVol - askVol) / total; // in [-1, 1]
}

/**
 * Compute VWAP from a batch of candles. Each candle is assumed to be a single
 * period (e.g. 1-minute bar); typical price = (H+L+C)/3.
 */
export function computeVWAP(candles: Candle[]): number | null {
  if (candles.length === 0) return null;
  let cumVolPrice = 0;
  let cumVol = 0;
  for (const c of candles) {
    const typicalPrice = (c.high + c.low + c.close) / 3;
    cumVolPrice += typicalPrice * c.volume;
    cumVol += c.volume;
  }
  if (cumVol === 0) return candles[candles.length - 1].close;
  return cumVolPrice / cumVol;
}

/**
 * Delta per candle (proxy for buying vs selling pressure):
 *   delta ≈ close - open (when volume > 0); otherwise 0.
 * A more accurate version would use tick-level buy/sell, but this is a
 * candle-level approximation sufficient for regime-filtering.
 */
export function computeDeltaCandle(candle: Candle): number {
  if (candle.volume === 0) return 0;
  // Sign convention: positive = buying pressure (close > open)
  return candle.close - candle.open;
}

/**
 * Full microstructure computation for a TF.
 * Returns null fields when the TF does not have microstructure data.
 */
export function computeMicroIndicators(
  tf: TfId,
  candles: Candle[],
  bidVol: number = 0,
  askVol: number = 0,
): MicroStructureIndicators {
  if (!isMicroTf(tf) || candles.length === 0) {
    return { obi: null, vwap: null, deltaCandle: null };
  }
  const lastCandle = candles[candles.length - 1];
  return {
    obi: computeOBI(bidVol, askVol),
    vwap: computeVWAP(candles),
    deltaCandle: computeDeltaCandle(lastCandle),
  };
}
