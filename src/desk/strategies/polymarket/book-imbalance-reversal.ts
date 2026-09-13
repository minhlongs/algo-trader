/**
 * Book Imbalance Reversal Strategy — V2 implementation.
 *
 * Detects orderbook bid/ask imbalance extremes using rolling z-score
 * and trades the subsequent mean-reversion.
 */

import type { GammaMarket } from '../../polymarket/gamma-client';
import type { RawOrderBook } from '../../polymarket/clob-client';
import { logger } from '../../core/logger';
import {
  BasePolymarketStrategy,
  type OpenPosition,
  type StrategyDeps,
} from './base-polymarket-strategy';
import {
  type BookImbalanceConfig,
  DEFAULT_CONFIG,
  STRATEGY_NAME,
} from './book-imbalance-reversal-types';
import {
  calcBidAskRatio,
  calcZScore,
} from './book-imbalance-reversal-math';

export type { BookImbalanceConfig } from './book-imbalance-reversal-types';
export { DEFAULT_CONFIG } from './book-imbalance-reversal-types';
export {
  calcBidVolume,
  calcAskVolume,
  calcBidAskRatio,
  calcZScore,
} from './book-imbalance-reversal-math';

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

    if (Math.abs(zScore) < this.cfg.exitZScore) {
      return {
        exit: true,
        reason: `imbalance-mean-reversion (z=${zScore.toFixed(2)})`,
      };
    }
    return { exit: false, reason: '' };
  }

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
        if (Math.abs(zScore) < this.cfg.zScoreThreshold) continue;

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

export function createBookImbalanceReversalTick(deps: StrategyDeps): () => Promise<void> {
  const strategy = new BookImbalanceReversalStrategy(deps);
  return strategy.toTickFn();
}
