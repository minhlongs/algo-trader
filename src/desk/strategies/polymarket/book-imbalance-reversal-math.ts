/**
 * Pure helper functions for book imbalance reversal strategy.
 */

/** Sum bid sizes up to `levels` depth. */
export function calcBidVolume(
  bids: ReadonlyArray<{ size: string }>,
  levels: number,
): number {
  const n = Math.min(levels, bids.length);
  let total = 0;
  for (let i = 0; i < n; i++) total += parseFloat(bids[i].size);
  return total;
}

/** Sum ask sizes up to `levels` depth. */
export function calcAskVolume(
  asks: ReadonlyArray<{ size: string }>,
  levels: number,
): number {
  const n = Math.min(levels, asks.length);
  let total = 0;
  for (let i = 0; i < n; i++) total += parseFloat(asks[i].size);
  return total;
}

/**
 * Bid/ask ratio from an orderbook snapshot.
 * Returns infinity when ask volume is zero (pure bid dominance).
 */
export function calcBidAskRatio(
  book: { bids: ReadonlyArray<{ size: string }>; asks: ReadonlyArray<{ size: string }> },
  levels: number,
): number {
  const bidVol = calcBidVolume(book.bids, levels);
  const askVol = calcAskVolume(book.asks, levels);
  if (askVol === 0) return bidVol > 0 ? Infinity : 1;
  return bidVol / askVol;
}

/** Z-score of a value against a history sample. Zero when history is insufficient. */
export function calcZScore(value: number, history: number[]): number {
  if (history.length < 3) return 0;
  const mean = history.reduce((s, v) => s + v, 0) / history.length;
  const variance = history.reduce((s, v) => s + (v - mean) ** 2, 0) / history.length;
  const std = Math.sqrt(variance);
  if (std === 0) return 0;
  return (value - mean) / std;
}
