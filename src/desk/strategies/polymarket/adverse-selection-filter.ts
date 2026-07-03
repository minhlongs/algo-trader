/**
 * Adverse Selection Filter Strategy — V2 implementation.
 *
 * Filters out trades with high adverse selection risk by
 * analyzing order flow toxicity and information asymmetry.
 *
 * Computes three signal scores per market:
 *   1. Order-book imbalance strength — how lopsided the book is
 *   2. Quote fading — how quickly the top-of-book moves against filled trades
 *   3. Spread widening — how much the spread widens relative to trailing average
 *
 * A composite adverse selection score (0-1) is used to gate
 * strategy entry. Score > threshold = skip the market.
 *
 * Exposes both a standalone scoring API and a tick function
 * for backward compatibility.
 */

import type { RawOrderBook } from '../../polymarket/clob-client';
import type { StrategyDeps } from './base-polymarket-strategy';
import { logger } from '../../core/logger';

// ── Config ─────────────────────────────────────────────────────────────────────

export interface AdverseSelectionConfig {
  /** Composite score threshold above which market is skipped (0-1) */
  threshold: number;
  /** Number of snapshots to keep for spread history */
  spreadHistorySize: number;
  /** Relative spread widening factor that flags adverse selection */
  spreadWidenFactor: number;
  /** Imbalance strength at which we flag as adverse (0-1) */
  imbalanceThreshold: number;
}

export const DEFAULT_CONFIG: AdverseSelectionConfig = {
  threshold: 0.55,
  spreadHistorySize: 10,
  spreadWidenFactor: 1.5,
  imbalanceThreshold: 0.65,
};

// ── Scoring functions ─────────────────────────────────────────────────────────

export interface AdverseSelectionScore {
  /** Composite score 0-1 (higher = more adverse selection risk) */
  composite: number;
  /** Imbalance strength component 0-1 */
  imbalanceScore: number;
  /** Spread widening component 0-1 */
  spreadScore: number;
  /** Quote fading component 0-1 */
  fadingScore: number;
  /** Human-readable flags */
  flags: string[];
  timestamp: number;
}

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

// ── Filter class ───────────────────────────────────────────────────────────────

export class AdverseSelectionFilter {
  private readonly config: AdverseSelectionConfig;
  /** Per-market spread history keyed by tokenId */
  private readonly spreadHistories = new Map<string, number[]>();

  constructor(config: Partial<AdverseSelectionConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Analyze a single order book snapshot for adverse selection risk.
   * Records spread data internally for trend detection.
   */
  analyze(book: RawOrderBook): AdverseSelectionScore {
    // Update spread history
    const bestBid = book.bids.length > 0 ? parseFloat(book.bids[0].price) : 0;
    const bestAsk = book.asks.length > 0 ? parseFloat(book.asks[0].price) : 1;
    const spread = bestAsk - bestBid;

    // Use a shared history key (empty string = single-market mode)
    let history = this.spreadHistories.get('default');
    if (!history) {
      history = [];
      this.spreadHistories.set('default', history);
    }
    history.push(spread);
    if (history.length > this.config.spreadHistorySize) {
      history.splice(0, history.length - this.config.spreadHistorySize);
    }

    return computeCompositeScore(book, history, this.config);
  }

  /**
   * Analyze a specific market's order book by token ID.
   * Maintains per-market spread history for better trend detection.
   */
  async analyzeMarket(
    tokenId: string,
    getBook: (tokenId: string) => Promise<RawOrderBook>,
  ): Promise<AdverseSelectionScore> {
    const book = await getBook(tokenId);

    // Update per-market spread history
    const bestBid = book.bids.length > 0 ? parseFloat(book.bids[0].price) : 0;
    const bestAsk = book.asks.length > 0 ? parseFloat(book.asks[0].price) : 1;
    const spread = bestAsk - bestBid;

    let history = this.spreadHistories.get(tokenId);
    if (!history) {
      history = [];
      this.spreadHistories.set(tokenId, history);
    }
    history.push(spread);
    if (history.length > this.config.spreadHistorySize) {
      history.splice(0, history.length - this.config.spreadHistorySize);
    }

    return computeCompositeScore(book, history, this.config);
  }
}

// ── Tick factory (backward compat) ─────────────────────────────────────────────

export function createAdverseSelectionFilterTick(deps: StrategyDeps): () => Promise<void> {
  const filter = new AdverseSelectionFilter();

  return async () => {
    try {
      const markets = await deps.gamma.getTrending(10);
      let flaggedCount = 0;

      for (const market of markets) {
        if (!market.yesTokenId || market.closed || market.resolved) continue;

        try {
          const book = await deps.clob.getOrderBook(market.yesTokenId);
          const score = filter.analyze(book);

          if (isAdverseSelection(score, DEFAULT_CONFIG.threshold)) {
            flaggedCount++;
            logger.debug('Adverse selection flagged', 'AdverseSelectionFilter', {
              market: market.conditionId,
              compositeScore: score.composite,
              flags: score.flags,
            });
          }
        } catch {
          continue;
        }
      }

      logger.debug('Adverse selection scan complete', 'AdverseSelectionFilter', {
        marketsScanned: markets.length,
        adverseFlagged: flaggedCount,
      });
    } catch (err) {
      logger.error('Adverse selection tick failed', 'AdverseSelectionFilter', { err: String(err) });
    }
  };
}
