/**
 * Triple-Barrier Labeling
 *
 * Deterministic event labeling for supervised learning.
 *
 * For a candidate entry at index `entryIdx`:
 * - TAKE_PROFIT (+1): price hits TP level first
 * - STOP_LOSS (-1): price hits SL level first
 * - TIMEOUT (0): max_holding bars elapse without hitting either barrier
 *
 * Invariants:
 * - Only future candles relative to entry are used.
 * - Missing bars are skipped (treated as no touch).
 * - Simultaneous TP+SL on the same bar resolves to -1 (SL wins) by default.
 *
 * @param candles Causal slice: candles[entryIdx] is the entry bar.
 * @param entryIdx Index of the entry bar in `candles`.
 * @param tp Take-profit as a fraction (e.g. 0.02 for +2%).
 * @param sl Stop-loss as a fraction (e.g. -0.01 for -1%, passed as positive magnitude).
 * @param maxHolding Maximum number of future bars to monitor.
 */

export type TripleBarrierLabel = 1 | -1 | 0;

export interface TripleBarrierResult {
  label: TripleBarrierLabel;
  /** Index of the bar that triggered the label, or maxHolding bar index on timeout. */
  triggeredAt: number;
  /** Causal: only future bars used. */
  numBarsScanned: number;
  /** TP/SL price levels for reference. */
  tpPrice: number;
  slPrice: number;
}

export function tripleBarrierLabel(
  candles: { high: number; low: number; close: number }[],
  entryIdx: number,
  tp = 0.02,
  sl = 0.01,
  maxHolding = 6,
): TripleBarrierResult {
  if (!Number.isFinite(tp) || tp <= 0) throw new Error('tp must be positive');
  if (!Number.isFinite(sl) || sl <= 0) throw new Error('sl must be positive');
  if (!Number.isInteger(maxHolding) || maxHolding <= 0) throw new Error('maxHolding must be positive integer');

  if (entryIdx < 0 || entryIdx >= candles.length) {
    throw new Error(`entryIdx ${entryIdx} out of range for candles length ${candles.length}`);
  }

  const entryPrice = candles[entryIdx]!.close;
  if (entryPrice <= 0) {
    throw new Error(`Invalid entry price: ${entryPrice}`);
  }

  const tpPrice = entryPrice * (1 + tp);
  const slPrice = entryPrice * (1 - sl);

  const end = Math.min(entryIdx + maxHolding, candles.length - 1);

  for (let i = entryIdx + 1; i <= end; i++) {
    const bar = candles[i]!;
    const hitTP = bar.high >= tpPrice;
    const hitSL = bar.low <= slPrice;

    if (hitTP && hitSL) {
      // Simultaneous touch on same bar: SL wins (conservative).
      return { label: -1, triggeredAt: i, numBarsScanned: i - entryIdx, tpPrice, slPrice };
    }
    if (hitTP) return { label: 1, triggeredAt: i, numBarsScanned: i - entryIdx, tpPrice, slPrice };
    if (hitSL) return { label: -1, triggeredAt: i, numBarsScanned: i - entryIdx, tpPrice, slPrice };
  }

  return { label: 0, triggeredAt: end, numBarsScanned: maxHolding, tpPrice, slPrice };
}

/**
 * Label every valid entry bar in a causal window.
 * Skips bars where labeling would exceed maxHolding beyond available data.
 */
export function batchLabel(
  candles: { high: number; low: number; close: number }[],
  tp = 0.02,
  sl = 0.01,
  maxHolding = 6,
  startIdx = 0,
): Array<TripleBarrierResult & { entryIdx: number }> {
  const results: Array<TripleBarrierResult & { entryIdx: number }> = [];
  // Need at least entryIdx + maxHolding bars remaining to label.
  const maxEntry = candles.length - 1 - maxHolding;
  if (maxEntry < startIdx) return results;
  for (let i = startIdx; i <= maxEntry; i++) {
    const r = tripleBarrierLabel(candles, i, tp, sl, maxHolding);
    results.push({ ...r, entryIdx: i });
  }
  return results;
}