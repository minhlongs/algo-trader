/**
 * Book Imbalance Reversal Strategy — V2 implementation.
 *
 * Detects orderbook bid/ask imbalance extremes using rolling z-score
 * and trades the subsequent mean-reversion. When the book is heavily
 * skewed to one side, the price has historically reversed.
 *
 * Entry: |z-score| >= threshold (extreme imbalance)
 *   - bid heavy (z-score > +threshold) -> overbought -> BUY NO (reversal down)
 *   - ask heavy (z-score < -threshold) -> oversold  -> BUY YES (reversal up)
 * Exit: imbalance mean-reversion (|z-score| < exit threshold) or profit target
 */

import type { GammaMarket } from '../../polymarket/gamma-client';
import type { RawOrderBook } from '../../polymarket/clob-client';
import type { StrategyName } from '../../core/types';
import { logger } from '../../core/logger';
import {
  BasePolymarketStrategy,
  type BaseStrategyConfig,
  type OpenPosition,
  type StrategyDeps,
} from './base-polymarket-strategy';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface BookImbalanceConfig extends BaseStrategyConfig {
  /** Number of orderbook levels to sum */
  depthLevels: number;
  /** Z-score threshold for entry */
  zScoreThreshold: number;
  /** Z-score threshold for exit (mean-reversion detected) */
  exitZScore: number;
  /** Rolling window (ticks) for mean/std calculation */
  lookbackWindow: number;
  /** Minimum ticks before entry */
  minTicks: number;
}

export const DEFAULT_CONFIG: BookImbalanceConfig = {
  depthLevels: 10,
  zScoreThreshold: 2.0,
  exitZScore: 0.5,
  lookbackWindow: 20,
  minTicks: 10,
  minVolume: 1000,
  takeProfitPct: 0.03,
  stopLossPct: 0.02,
  maxHoldMs: 15 * 60_000,
  maxPositions: 3,
  cooldownMs: 120_000,
  positionSize: '20',
};

const STRATEGY_NAME: StrategyName = 'book-imbalance-reversal';

// ---------------------------------------------------------------------------
// Pure helpers (exported for testing)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Strategy class
// ---------------------------------------------------------------------------

export class BookImbalanceReversalStrategy extends BasePolymarketStrategy {
  private readonly cfg: BookImbalanceConfig;
  private readonly ratioHistory = new Map<string, number[]>();

  constructor(deps: StrategyDeps, config: Partial<BookImbalanceConfig> = {}) {
    const fullConfig: BookImbalanceConfig = { ...DEFAULT_CONFIG, ...config };
    super(deps, fullConfig, STRATEGY_NAME);
    this.cfg = fullConfig;
  }

  private recordRatio(tokenId: string, ratio: number): void {
    let history = this.ratioHistory.get(tokenId);
    if (!history) {
      history = [];
      this.ratioHistory.set(tokenId, history);
    }
    history.push(ratio);
    const maxLen = this.cfg.lookbackWindow * 3;
    if (history.length > maxLen) history.splice(0, history.length - maxLen);
  }

  // -----------------------------------------------------------------------
  // Custom exit: imbalance mean-reversion
  // -----------------------------------------------------------------------

  protected getCustomExitCondition(
    pos: OpenPosition,
    _currentPrice: number,
    book?: RawOrderBook,
  ): { exit: boolean; reason: string } {
    if (!book) return { exit: false, reason: '' };

    const history = this.ratioHistory.get(pos.tokenId);
    if (!history || history.length < 3) return { exit: false, reason: '' };

    const ratio = calcBidAskRatio(book, this.cfg.depthLevels);
    const zScore = calcZScore(ratio, history);

    // Exit when imbalance mean-reverts (|z-score| below threshold)
    if (Math.abs(zScore) < this.cfg.exitZScore) {
      return {
        exit: true,
        reason: `imbalance-mean-reversion (z=${zScore.toFixed(2)})`,
      };
    }

    return { exit: false, reason: '' };
  }

  // -----------------------------------------------------------------------
  // Entry scanning
  // -----------------------------------------------------------------------

  protected async scanEntries(markets: GammaMarket[]): Promise<void> {
    if (this.getPositionCount() >= this.cfg.maxPositions) return;

    for (const market of markets) {
      if (this.getPositionCount() >= this.cfg.maxPositions) break;
      if (!market.yesTokenId || market.closed || market.resolved) continue;
      if (this.hasPosition(market.conditionId)) continue;
      if (this.isOnCooldown(market.conditionId)) continue;
      if ((market.volume ?? 0) < this.cfg.minVolume) continue;

      try {
        const book = await this.deps.clob.getOrderBook(market.yesTokenId);
        const ba = this.bestBidAsk(book);
        if (ba.mid <= 0 || ba.mid >= 1) continue;

        const ratio = calcBidAskRatio(book, this.cfg.depthLevels);
        this.recordRatio(market.yesTokenId, ratio);

        const history = this.ratioHistory.get(market.yesTokenId) ?? [];
        if (history.length < this.cfg.minTicks) continue;

        const zScore = calcZScore(ratio, history);

        // Only trade extreme imbalance
        if (Math.abs(zScore) < this.cfg.zScoreThreshold) continue;

        // Determine reversal direction
        // bid heavy (z > threshold) -> overbought -> reversal down -> BUY NO
        // ask heavy (z < -threshold) -> oversold -> reversal up -> BUY YES
        const side: 'yes' | 'no' = zScore < 0 ? 'yes' : 'no';

        const tokenId = side === 'yes'
          ? market.yesTokenId
          : (market.noTokenId ?? market.yesTokenId);
        const entryPrice = side === 'yes' ? ba.ask : (1 - ba.bid);
        if (entryPrice <= 0 || entryPrice >= 1) continue;

        await this.enterPosition(
          tokenId,
          market.conditionId,
          side,
          entryPrice,
          parseFloat(this.cfg.positionSize),
        );

        logger.debug('Imbalance entry', this.strategyName, {
          conditionId: market.conditionId,
          side,
          entryPrice: entryPrice.toFixed(4),
          bidAskRatio: ratio.toFixed(2),
          zScore: zScore.toFixed(2),
        });
      } catch (err) {
        logger.debug('Scan error', this.strategyName, {
          market: market.conditionId,
          err: String(err),
        });
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Legacy factory
// ---------------------------------------------------------------------------

export function createBookImbalanceReversalTick(deps: StrategyDeps): () => Promise<void> {
  const strategy = new BookImbalanceReversalStrategy(deps);
  return strategy.toTickFn();
}
