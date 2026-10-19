/**
 * Sentiment Momentum Strategy Implementation
 * Polymarket V2 strategy combining trend strength and volume confirmation.
 */
import type { GammaMarket } from '../../polymarket/gamma-client';
import { logger } from '../../core/logger';
import {
  BasePolymarketStrategy,
  type OpenPosition,
  type StrategyDeps,
} from './base-polymarket-strategy';
import {
  type SentimentMomentumConfig,
  DEFAULT_CONFIG,
  STRATEGY_NAME,
  calcTrendStrength,
  calcDirection,
  detectVolumeConfirmation,
  appendBoundedHistory,
  evaluateSentimentExit,
} from './sentiment-momentum-helpers';

export class SentimentMomentumStrategy extends BasePolymarketStrategy {
  private readonly cfg: SentimentMomentumConfig;
  private readonly priceHistory = new Map<string, number[]>();
  private readonly volumeHistory = new Map<string, number[]>();
  private readonly prevTrendStrength = new Map<string, number>();

  constructor(deps: StrategyDeps, config: Partial<SentimentMomentumConfig> = {}) {
    const fullConfig: SentimentMomentumConfig = { ...DEFAULT_CONFIG, ...config };
    super(deps, fullConfig, STRATEGY_NAME);
    this.cfg = fullConfig;
  }

  private recordTick(tokenId: string, price: number, volume: number): void {
    const maxLen = this.cfg.adxPeriod * 4;
    appendBoundedHistory(this.priceHistory, tokenId, price, maxLen);
    appendBoundedHistory(this.volumeHistory, tokenId, volume, maxLen);
  }

  protected getCustomExitCondition(
    pos: OpenPosition,
    _currentPrice: number,
  ): { exit: boolean; reason: string } {
    return evaluateSentimentExit(
      this.priceHistory.get(pos.tokenId),
      this.volumeHistory.get(pos.tokenId),
      this.prevTrendStrength.get(pos.tokenId),
      this.cfg,
    );
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

      try {
        const book = await this.deps.clob.getOrderBook(market.yesTokenId);
        const ba = this.bestBidAsk(book);
        if (ba.mid <= 0 || ba.mid >= 1) continue;

        this.recordTick(market.yesTokenId, ba.mid, market.volume);
        const prices = this.priceHistory.get(market.yesTokenId) ?? [];
        const vols = this.volumeHistory.get(market.yesTokenId) ?? [];

        if (prices.length < this.cfg.minTicks) continue;

        const strength = calcTrendStrength(prices, this.cfg.adxPeriod);
        this.prevTrendStrength.set(market.yesTokenId, strength);

        // Check trend strength threshold
        if (strength < this.cfg.adxThreshold) continue;

        // Get directional bias
        const dir = calcDirection(prices, this.cfg.adxPeriod);
        if (!dir) continue;

        // Check volume confirmation
        if (!detectVolumeConfirmation(vols, this.cfg.volumeLookback)) continue;

        const side: 'yes' | 'no' = dir;
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

        logger.debug('Sentiment momentum entry', this.strategyName, {
          conditionId: market.conditionId,
          side,
          entryPrice: entryPrice.toFixed(4),
          trendStrength: strength.toFixed(1),
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

export function createSentimentMomentumTick(deps: StrategyDeps): () => Promise<void> {
  const strategy = new SentimentMomentumStrategy(deps);
  return strategy.toTickFn();
}
