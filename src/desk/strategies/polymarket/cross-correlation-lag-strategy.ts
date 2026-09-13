/**
 * Strategy implementation and tick factory for Cross-Correlation Lag V2.
 */

import type { GammaMarket } from '../../polymarket/gamma-client';
import { logger } from '../../core/logger';
import { BasePolymarketStrategy } from './base-polymarket-strategy';
import {
  CrossCorrelationLagConfig,
  CrossCorrelationLagDeps,
  DEFAULT_CONFIG,
  STRATEGY_NAME,
} from './cross-correlation-lag-types';
import { findBestLag, predictMove } from './cross-correlation-lag-math';

export class CrossCorrelationLagStrategy extends BasePolymarketStrategy {
  private readonly cfg: CrossCorrelationLagConfig;
  private readonly priceHistory = new Map<string, number[]>();

  constructor(deps: CrossCorrelationLagDeps, config: Partial<CrossCorrelationLagConfig> = {}) {
    const fullConfig: CrossCorrelationLagConfig = { ...DEFAULT_CONFIG, ...config };
    super(deps, fullConfig, STRATEGY_NAME);
    this.cfg = fullConfig;
  }

  /** Required by abstract base — unused; real entry uses scanEventEntries. */
  protected async scanEntries(_markets: GammaMarket[]): Promise<void> {
    // no-op: overridden execute() uses scanEventEntries instead
  }

  private recordPrice(tokenId: string, price: number): void {
    let history = this.priceHistory.get(tokenId);
    if (!history) { history = []; this.priceHistory.set(tokenId, history); }
    history.push(price);
    if (history.length > this.cfg.priceWindow) {
      history.splice(0, history.length - this.cfg.priceWindow);
    }
  }

  private async scanEventEntries(eventMarkets: GammaMarket[][]): Promise<void> {
    if (this.getPositionCount() >= this.cfg.maxPositions) return;

    for (const markets of eventMarkets) {
      if (this.getPositionCount() >= this.cfg.maxPositions) break;

      const eligible = markets.filter(m =>
        m.yesTokenId && !m.closed && !m.resolved && (m.volume ?? 0) >= this.cfg.minVolume,
      );
      if (eligible.length < this.cfg.minMarketsPerEvent) continue;

      const marketPrices = new Map<string, { market: GammaMarket; mid: number; bid: number; ask: number }>();

      for (const market of eligible) {
        try {
          const book = await this.deps.clob.getOrderBook(market.yesTokenId!);
          const ba = this.bestBidAsk(book);
          if (ba.mid <= 0 || ba.mid >= 1) continue;
          this.recordPrice(market.yesTokenId!, ba.mid);
          marketPrices.set(market.yesTokenId!, { market, ...ba });
        } catch { continue; }
      }

      const tokenIds = Array.from(marketPrices.keys());
      for (let i = 0; i < tokenIds.length; i++) {
        if (this.getPositionCount() >= this.cfg.maxPositions) break;
        for (let j = 0; j < tokenIds.length; j++) {
          if (i === j || this.getPositionCount() >= this.cfg.maxPositions) break;

          const leaderTokenId = tokenIds[i];
          const followerTokenId = tokenIds[j];
          const leaderPrices = this.priceHistory.get(leaderTokenId) ?? [];
          const followerPrices = this.priceHistory.get(followerTokenId) ?? [];

          if (leaderPrices.length < this.cfg.maxLag + 2 || followerPrices.length < this.cfg.maxLag + 2) continue;

          const { lag, correlation } = findBestLag(leaderPrices, followerPrices, this.cfg.maxLag);
          if (lag === 0 || Math.abs(correlation) < this.cfg.minCorrelation) continue;

          const predicted = predictMove(leaderPrices, lag);
          if (Math.abs(predicted) < this.cfg.predictionThreshold) continue;

          if (this.hasPosition(marketPrices.get(followerTokenId)!.market.conditionId)) continue;
          if (this.isOnCooldown(marketPrices.get(followerTokenId)!.market.conditionId)) continue;

          const followerInfo = marketPrices.get(followerTokenId)!;
          const effectiveMove = correlation > 0 ? predicted : -predicted;
          const side: 'yes' | 'no' = effectiveMove > 0 ? 'yes' : 'no';
          const tokenId = side === 'yes'
            ? followerTokenId
            : (followerInfo.market.noTokenId ?? followerTokenId);
          const entryPrice = side === 'yes' ? followerInfo.ask : (1 - followerInfo.bid);

          try {
            await this.enterPosition(tokenId, followerInfo.market.conditionId, side, entryPrice,
              parseFloat(this.cfg.positionSize));

            logger.debug('Cross-correlation entry', this.strategyName, {
              leaderTokenId, followerTokenId, lag,
              correlation: correlation.toFixed(4),
              predictedMove: predicted.toFixed(4),
            });
          } catch (err) {
            logger.debug('Entry order failed', this.strategyName, {
              followerTokenId, err: String(err),
            });
          }
        }
      }
    }
  }

  /** Override execute() — this strategy uses getEvents() for cross-correlation across event markets. */
  async execute(): Promise<void> {
    try {
      await this.checkExits();
      const events = await this.deps.gamma.getEvents(15);
      const eventMarkets: GammaMarket[][] = events
        .map(e => e.markets)
        .filter(m => m.length >= this.cfg.minMarketsPerEvent);
      await this.scanEventEntries(eventMarkets);
      logger.debug('Tick complete', this.strategyName, {
        openPositions: this.positions.length,
      });
    } catch (err) {
      logger.error('Tick failed', this.strategyName, { err: String(err) });
    }
  }
}

export function createCrossCorrelationLagTick(deps: CrossCorrelationLagDeps): () => Promise<void> {
  const { config, ...baseDeps } = deps;
  const strategy = new CrossCorrelationLagStrategy(baseDeps, config);
  return strategy.toTickFn();
}
