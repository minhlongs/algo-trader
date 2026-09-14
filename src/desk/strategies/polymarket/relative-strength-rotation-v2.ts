/**
 * Relative Strength Rotation V2 — extends BasePolymarketStrategy.
 *
 * Ranks markets within the same event by recent price momentum (relative
 * strength). Rotates capital toward the strongest-performing markets.
 *
 * Uses gamma.getEvents() instead of getTrending() — overrides execute().
 */

import type { GammaMarket } from '../../polymarket/gamma-client';
import type { StrategyName } from '../../core/types';
import { logger } from '../../core/logger';
import {
  BasePolymarketStrategy,
  type StrategyDeps,
} from './base-polymarket-strategy';
import {
  type RelativeStrengthRotationConfig,
  type RelativeStrengthRotationDeps,
  DEFAULT_CONFIG,
} from './relative-strength-rotation-types';
import {
  calcMomentum,
  rankByMomentum,
  selectLeaders,
  calcRankSpread,
} from './relative-strength-rotation-helpers';

export * from './relative-strength-rotation-types';
export * from './relative-strength-rotation-helpers';

const STRATEGY_NAME = 'relative-strength-rotation' as StrategyName;

export class RelativeStrengthRotationStrategy extends BasePolymarketStrategy {
  private readonly cfg: RelativeStrengthRotationConfig;
  private readonly priceHistory = new Map<string, number[]>();

  constructor(deps: StrategyDeps, config: Partial<RelativeStrengthRotationConfig> = {}) {
    const fullConfig: RelativeStrengthRotationConfig = { ...DEFAULT_CONFIG, ...config };
    super(deps, fullConfig, STRATEGY_NAME);
    this.cfg = fullConfig;
  }

  /** Required by abstract base — unused; real entry uses scanEventEntries. */
  protected async scanEntries(_markets: GammaMarket[]): Promise<void> { /* no-op */ }

  private recordPrice(tokenId: string, price: number): void {
    let history = this.priceHistory.get(tokenId);
    if (!history) { history = []; this.priceHistory.set(tokenId, history); }
    history.push(price);
    if (history.length > this.cfg.lookbackWindow) {
      history.splice(0, history.length - this.cfg.lookbackWindow);
    }
  }

  private getPrices(tokenId: string): number[] {
    return this.priceHistory.get(tokenId) ?? [];
  }

  private async scanEventEntries(eventMarkets: Map<string, GammaMarket[]>): Promise<void> {
    if (this.getPositionCount() >= this.cfg.maxPositions) return;

    for (const [, markets] of eventMarkets) {
      if (this.getPositionCount() >= this.cfg.maxPositions) break;

      const eligible = markets.filter(m =>
        m.yesTokenId && !m.closed && !m.resolved && (m.volume ?? 0) >= this.cfg.minVolume,
      );
      if (eligible.length < this.cfg.minMarketsPerEvent) continue;

      const momentums = new Map<string, number>();
      const marketsByToken = new Map<string, GammaMarket>();

      for (const market of eligible) {
        try {
          const book = await this.deps.clob.getOrderBook(market.yesTokenId!);
          const ba = this.bestBidAsk(book);
          if (ba.mid <= 0 || ba.mid >= 1) continue;

          this.recordPrice(market.yesTokenId!, ba.mid);
          const prices = this.getPrices(market.yesTokenId!);
          if (prices.length < 2) continue;

          const mom = calcMomentum(prices);
          momentums.set(market.yesTokenId!, mom);
          marketsByToken.set(market.yesTokenId!, market);
        } catch { continue; }
      }

      if (momentums.size < this.cfg.minMarketsPerEvent) continue;

      const spread = calcRankSpread(Array.from(momentums.values()));
      if (spread < this.cfg.minRankSpread) continue;

      const ranked = rankByMomentum(momentums);
      const leaders = selectLeaders(ranked, this.cfg.topNPercent);

      for (const tokenId of leaders) {
        if (this.getPositionCount() >= this.cfg.maxPositions) break;
        if (this.hasPosition(marketsByToken.get(tokenId)!.conditionId)) continue;
        if (this.isOnCooldown(marketsByToken.get(tokenId)!.conditionId)) continue;

        const market = marketsByToken.get(tokenId)!;
        try {
          const book = await this.deps.clob.getOrderBook(tokenId);
          const ba = this.bestBidAsk(book);
          // Always buy YES (leaders are bought, not shorted)
          await this.enterPosition(tokenId, market.conditionId, 'yes', ba.ask,
            parseFloat(this.cfg.positionSize));

          logger.debug('Rotation entry', this.strategyName, {
            conditionId: market.conditionId,
            momentum: momentums.get(tokenId)?.toFixed(4),
          });
        } catch (err) {
          logger.debug('Entry error', this.strategyName, {
            market: market.conditionId, err: String(err),
          });
        }
      }
    }
  }

  /** Override execute() — uses getEvents() for event-grouped ranking. */
  async execute(): Promise<void> {
    try {
      await this.checkExits();
      const events = await this.deps.gamma.getEvents(15);
      const eventMarkets = new Map<string, GammaMarket[]>();
      for (const event of events) {
        if (event.markets && event.markets.length > 0) {
          eventMarkets.set(event.id, event.markets);
        }
      }
      await this.scanEventEntries(eventMarkets);
      logger.debug('Tick complete', this.strategyName, {
        openPositions: this.positions.length,
        events: eventMarkets.size,
      });
    } catch (err) {
      logger.error('Tick failed', this.strategyName, { err: String(err) });
    }
  }
}

export function createRelativeStrengthRotationTick(
  deps: RelativeStrengthRotationDeps,
): () => Promise<void> {
  const { config, ...baseDeps } = deps;
  const strategy = new RelativeStrengthRotationStrategy(baseDeps, config);
  return strategy.toTickFn();
}
