/**
 * Herd Behavior Detector V2 — extends BasePolymarketStrategy.
 *
 * Measures correlation of price movements across unrelated markets.
 * When avg pairwise correlation exceeds threshold, herding is detected.
 * Tracks herd intensity with EMA — fades the herd at peak (trade opposite).
 *
 * Herd moving prices up → BUY NO (fade). Herd moving prices down → BUY YES.
 * Pure math in ./herd-behavior-math-helpers.ts
 */

import type { GammaMarket } from '../../polymarket/gamma-client';
import { logger } from '../../core/logger';
import {
  BasePolymarketStrategy,
  type StrategyDeps,
} from './base-polymarket-strategy';
import {
  calcReturn,
  calcAvgPairwiseCorrelation,
  detectHerdPeak,
  calcHerdDirection,
  calcPearsonR,
  updateEma,
} from './herd-behavior-math-helpers';
import {
  DEFAULT_CONFIG,
  STRATEGY_NAME,
  HerdPriceHistoryTracker,
  evaluateHerdFadeSignal,
  resolveHerdFadeEntryParams,
  type HerdBehaviorDetectorConfig,
  type ValidMarketPrices,
} from './herd-behavior-series-tracker';

export type { HerdBehaviorDetectorConfig };
export {
  DEFAULT_CONFIG,
  calcReturn,
  calcAvgPairwiseCorrelation,
  detectHerdPeak,
  calcHerdDirection,
  calcPearsonR,
};

export class HerdBehaviorDetectorStrategy extends BasePolymarketStrategy {
  private readonly cfg: HerdBehaviorDetectorConfig;
  private readonly tracker = new HerdPriceHistoryTracker();
  private prevHerdEma: number | null = null;
  private currentHerdEma: number | null = null;

  constructor(deps: StrategyDeps, config: Partial<HerdBehaviorDetectorConfig> = {}) {
    const fullConfig: HerdBehaviorDetectorConfig = { ...DEFAULT_CONFIG, ...config };
    super(deps, fullConfig, STRATEGY_NAME);
    this.cfg = fullConfig;
  }

  private recordPrice(tokenId: string, price: number): void {
    this.tracker.recordPrice(tokenId, price, this.cfg.returnWindow);
  }

  private getPrices(tokenId: string): number[] {
    return this.tracker.getPrices(tokenId);
  }

  protected async scanEntries(markets: GammaMarket[]): Promise<void> {
    if (this.getPositionCount() >= this.cfg.maxPositions) return;

    const validMarkets: ValidMarketPrices[] = [];

    for (const market of markets) {
      if (!market.yesTokenId || market.closed || market.resolved) continue;
      if ((market.volume ?? 0) < this.cfg.minVolume) continue;

      try {
        const book = await this.deps.clob.getOrderBook(market.yesTokenId);
        const ba = this.bestBidAsk(book);
        if (ba.mid <= 0 || ba.mid >= 1) continue;

        this.recordPrice(market.yesTokenId, ba.mid);
        const prices = this.getPrices(market.yesTokenId);
        if (prices.length >= 2) {
          validMarkets.push({ market, prices });
        }
      } catch (err) {
        logger.debug('Fetch error', this.strategyName, {
          market: market.conditionId, err: String(err),
        });
      }
    }

    if (validMarkets.length < this.cfg.minMarkets) return;

    const { returnSeries, marketReturns } = this.tracker.buildReturnSeries(validMarkets);
    const avgCorr = calcAvgPairwiseCorrelation(returnSeries);
    this.prevHerdEma = this.currentHerdEma;
    this.currentHerdEma = updateEma(this.currentHerdEma, avgCorr, this.cfg.herdEmaAlpha);

    const signal = evaluateHerdFadeSignal(
      returnSeries,
      marketReturns,
      this.prevHerdEma,
      this.currentHerdEma,
      this.cfg.herdThreshold
    );
    if (!signal) return;

    for (const { market } of marketReturns) {
      if (this.getPositionCount() >= this.cfg.maxPositions) break;
      if (!market.yesTokenId) continue;
      if (this.hasPosition(market.conditionId) || this.isOnCooldown(market.conditionId)) continue;

      const entryParams = resolveHerdFadeEntryParams(
        market,
        this.getPrices(market.yesTokenId),
        signal.fadeSide
      );
      if (!entryParams) continue;

      try {
        await this.enterPosition(
          entryParams.tokenId,
          market.conditionId,
          signal.fadeSide,
          entryParams.entryPrice,
          parseFloat(this.cfg.positionSize)
        );

        logger.debug('Herd fade entry', this.strategyName, {
          conditionId: market.conditionId, side: signal.fadeSide,
          entryPrice: entryParams.entryPrice.toFixed(4),
          avgCorrelation: signal.avgCorr.toFixed(4),
          herdEma: this.currentHerdEma!.toFixed(4),
          direction: signal.direction,
        });
      } catch (err) {
        logger.debug('Entry error', this.strategyName, {
          market: market.conditionId, err: String(err),
        });
      }
    }
  }
}

export interface HerdBehaviorDetectorDeps extends StrategyDeps {
  config?: Partial<HerdBehaviorDetectorConfig>;
}

export function createHerdBehaviorDetectorTick(
  deps: HerdBehaviorDetectorDeps,
): () => Promise<void> {
  const { config, ...baseDeps } = deps;
  const strategy = new HerdBehaviorDetectorStrategy(baseDeps, config);
  return strategy.toTickFn();
}
