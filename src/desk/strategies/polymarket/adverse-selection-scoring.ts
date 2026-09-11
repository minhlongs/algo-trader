import type { RawOrderBook } from '../../polymarket/clob-client';
import type { AdverseSelectionConfig, AdverseSelectionScore } from './adverse-selection-types';

/**
 * Compute order-book imbalance strength.
 * Returns 0 (balanced) to 1 (completely one-sided).
 */
export function computeImbalanceStrength(book: RawOrderBook): number {
  const bidVol = book.bids.reduce((s, l) => s + parseFloat(l.size), 0);
  const askVol = book.asks.reduce((s, l) => s + parseFloat(l.size), 0);
  const total = bidVol + askVol;
  if (total <= 0) return 0;

  // How far from perfect balance: 0.5 = neutral, maps to 0; 1 or 0 maps to 1
  const ratio = bidVol / total;
  return Math.abs(ratio - 0.5) * 2;
}

/**
 * Compute spread relative to trailing average.
 * Returns 0 (normal) to 1 (widened significantly).
 */
export function computeSpreadScore(
  book: RawOrderBook,
  spreadHistory: number[],
  widenFactor: number,
): number {
  const bestBid = book.bids.length > 0 ? parseFloat(book.bids[0].price) : 0;
  const bestAsk = book.asks.length > 0 ? parseFloat(book.asks[0].price) : 1;
  if (bestBid <= 0 || bestAsk >= 1) return 0;

  const currentSpread = bestAsk - bestBid;
  if (currentSpread <= 0) return 0;

  if (spreadHistory.length === 0) return 0;

  const avgSpread = spreadHistory.reduce((s, v) => s + v, 0) / spreadHistory.length;
  if (avgSpread <= 0) return 0;

  const ratio = currentSpread / avgSpread;
  if (ratio <= 1) return 0;

  return Math.min(1, (ratio - 1) / (widenFactor - 1 || 1));
}

/**
 * Compute quote fading score by comparing bid and ask depth symmetry.
 * When one side has disproportionately thin liquidity, the quote is
 * likely to fade (adverse selection for the other side).
 * Returns 0 (symmetric) to 1 (highly asymmetric).
 */
export function computeFadingScore(book: RawOrderBook): number {
  // Average quote size on each side
  const bidSizes = book.bids.map(l => parseFloat(l.size));
  const askSizes = book.asks.map(l => parseFloat(l.size));

  if (bidSizes.length === 0 || askSizes.length === 0) return 0;

  const avgBid = bidSizes.reduce((s, v) => s + v, 0) / bidSizes.length;
  const avgAsk = askSizes.reduce((s, v) => s + v, 0) / askSizes.length;
  const total = avgBid + avgAsk;
  if (total <= 0) return 0;

  // How asymmetric the depth is
  const bidShare = avgBid / total;
  return Math.abs(bidShare - 0.5) * 2;
}

/**
 * Compute composite adverse selection score from individual components.
 * Weighted average of imbalance + spread + fading.
 */
export function computeCompositeScore(
  book: RawOrderBook,
  spreadHistory: number[],
  config: AdverseSelectionConfig,
): AdverseSelectionScore {
  const imbalanceScore = computeImbalanceStrength(book);
  const spreadScore = computeSpreadScore(book, spreadHistory, config.spreadWidenFactor);
  const fadingScore = computeFadingScore(book);

  const composite = imbalanceScore * 0.4 + spreadScore * 0.35 + fadingScore * 0.25;

  const flags: string[] = [];
  if (imbalanceScore >= config.imbalanceThreshold) flags.push('imbalanced');
  if (spreadScore >= 0.5) flags.push('spread-widened');
  if (fadingScore >= 0.5) flags.push('asymmetric-depth');

  return {
    composite: parseFloat(composite.toFixed(4)),
    imbalanceScore: parseFloat(imbalanceScore.toFixed(4)),
    spreadScore: parseFloat(spreadScore.toFixed(4)),
    fadingScore: parseFloat(fadingScore.toFixed(4)),
    flags,
    timestamp: Date.now(),
  };
}

/**
 * Check whether the composite score signals adverse selection.
 */
export function isAdverseSelection(score: AdverseSelectionScore, threshold: number): boolean {
  return score.composite >= threshold && score.flags.length >= 2;
}
