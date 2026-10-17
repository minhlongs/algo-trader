/**
 * Gap Fill Reversion V2 — extends BasePolymarketStrategy.
 *
 * Detects price gaps (sudden jumps) and trades the expectation that gaps
 * fill — price reverts toward the pre-gap level.
 *
 * Signal: up gap → BUY NO, down gap → BUY YES.
 * Requires gap persist for confirmTicks before entry.
 */

import type { GammaMarket } from '../../polymarket/gamma-client';
import type { StrategyName } from '../../core/types';
import { logger } from '../../core/logger';
import {
  BasePolymarketStrategy,
  type StrategyDeps,
} from './base-polymarket-strategy';
import {
  type GapFillReversionConfig,
  type GapRecord,
  DEFAULT_CONFIG,
  detectGap,
  isGapConfirmed,
  isGapStale,
  calcFillTarget,
} from './gap-fill-reversion-types';

export type { GapFillReversionConfig, GapRecord } from './gap-fill-reversion-types';
export {
  DEFAULT_CONFIG,
  detectGap,
  isGapConfirmed,
  isGapStale,
  calcFillTarget,
} from './gap-fill-reversion-types';

const STRATEGY_NAME = 'gap-fill-reversion' as StrategyName;

export class GapFillReversionStrategy extends BasePolymarketStrategy {
  private readonly cfg: GapFillReversionConfig;
  private readonly lastPrices = new Map<string, number>();
  private readonly activeGaps = new Map<string, GapRecord>();

  constructor(deps: StrategyDeps, config: Partial<GapFillReversionConfig> = {}) {
    const fullConfig: GapFillReversionConfig = { ...DEFAULT_CONFIG, ...config };
    super(deps, fullConfig, STRATEGY_NAME);
    this.cfg = fullConfig;
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

        const prevPrice = this.lastPrices.get(market.yesTokenId);
        this.lastPrices.set(market.yesTokenId, ba.mid);
        if (prevPrice === undefined) continue;

        const now = Date.now();
        const existingGap = this.activeGaps.get(market.yesTokenId);

        if (existingGap) {
          if (isGapStale(existingGap.timestamp, now, this.cfg.gapDecayMs)) {
            this.activeGaps.delete(market.yesTokenId);
            continue;
          }

          if (existingGap.direction === 'up' && ba.mid >= existingGap.gapPrice) {
            existingGap.confirmCount++;
          } else if (existingGap.direction === 'down' && ba.mid <= existingGap.gapPrice) {
            existingGap.confirmCount++;
          } else {
            this.activeGaps.delete(market.yesTokenId);
            continue;
          }

          if (
            !isGapConfirmed(
              existingGap.direction,
              existingGap.gapPrice,
              ba.mid,
              existingGap.confirmCount,
              this.cfg.confirmTicks,
            )
          ) {
            continue;
          }

          const side: 'yes' | 'no' = existingGap.direction === 'down' ? 'yes' : 'no';
          const tokenId = side === 'yes' ? market.yesTokenId : (market.noTokenId ?? market.yesTokenId);
          const entryPrice = side === 'yes' ? ba.ask : 1 - ba.bid;

          await this.enterPosition(tokenId, market.conditionId, side, entryPrice, parseFloat(this.cfg.positionSize));

          logger.debug('Gap fill entry', this.strategyName, {
            gapDirection: existingGap.direction,
            gapSize: existingGap.size.toFixed(4),
            preGapPrice: existingGap.preGapPrice.toFixed(4),
            fillTarget: calcFillTarget(existingGap.preGapPrice, existingGap.gapPrice).toFixed(4),
          });

          this.activeGaps.delete(market.yesTokenId);
        } else {
          const gap = detectGap(prevPrice, ba.mid, this.cfg.gapThreshold);
          if (gap.isGap) {
            this.activeGaps.set(market.yesTokenId, {
              direction: gap.direction,
              size: gap.size,
              preGapPrice: prevPrice,
              gapPrice: ba.mid,
              timestamp: now,
              confirmCount: 0,
            });
          }
        }
      } catch (err) {
        logger.debug('Scan error', this.strategyName, {
          market: market.conditionId,
          err: String(err),
        });
      }
    }
  }
}

export interface GapFillReversionDeps extends StrategyDeps {
  config?: Partial<GapFillReversionConfig>;
}

export function createGapFillReversionTick(deps: GapFillReversionDeps): () => Promise<void> {
  const { config, ...baseDeps } = deps;
  const strategy = new GapFillReversionStrategy(baseDeps, config);
  return strategy.toTickFn();
}
