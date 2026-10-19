/**
 * Smart Money Divergence Strategy — V2 implementation.
 *
 * Detects divergence between retail order flow and institutional
 * ("smart money") positioning.
 */

import type { GammaMarket } from '../../polymarket/gamma-client';
import type { RawOrderBook } from '../../polymarket/clob-client';
import type { StrategyName } from '../../core/types';
import type { OpenPosition } from './base-polymarket-strategy';
import { logger } from '../../core/logger';
import {
  BasePolymarketStrategy,
  type BaseStrategyConfig,
  type StrategyDeps,
} from './base-polymarket-strategy';
import {
  computeSmartOBI,
  getTrendDirection,
  detectDivergence,
} from './smart-money-divergence-math';

export {
  computeSmartOBI,
  getTrendDirection,
  detectDivergence,
} from './smart-money-divergence-math';

export interface SmartMoneyDivergenceConfig extends BaseStrategyConfig {
  trendWindow: number;
  obiThreshold: number;
  smartLevels: number;
}

export const DEFAULT_CONFIG: SmartMoneyDivergenceConfig = {
  trendWindow: 5,
  obiThreshold: 1.5,
  smartLevels: 3,
  minVolume: 1000,
  takeProfitPct: 0.04,
  stopLossPct: 0.025,
  maxHoldMs: 10 * 60_000,
  maxPositions: 3,
  cooldownMs: 120_000,
  positionSize: '12',
};

const STRATEGY_NAME: StrategyName = 'smart-money-divergence';

export class SmartMoneyDivergenceStrategy extends BasePolymarketStrategy {
  private readonly cfg: SmartMoneyDivergenceConfig;
  private readonly priceHistory = new Map<string, number[]>();

  constructor(deps: StrategyDeps, config: Partial<SmartMoneyDivergenceConfig> = {}) {
    const fullConfig: SmartMoneyDivergenceConfig = { ...DEFAULT_CONFIG, ...config };
    super(deps, fullConfig, STRATEGY_NAME);
    this.cfg = fullConfig;
  }

  protected getCustomExitCondition(
    pos: OpenPosition,
    currentPrice: number,
    book?: RawOrderBook,
  ): { exit: boolean; reason: string } {
    if (!book) return { exit: false, reason: '' };

    const obi = computeSmartOBI(book, this.cfg.smartLevels);
    const prices = this.priceHistory.get(pos.tokenId);
    const trend = prices ? getTrendDirection(prices.slice(-this.cfg.trendWindow)) : 0;

    const divergence = detectDivergence(obi, trend, this.cfg.obiThreshold);
    if (!divergence) {
      return { exit: false, reason: '' };
    }

    if (pos.side === divergence) {
      return { exit: false, reason: '' };
    }

    return { exit: true, reason: 'divergence-reversed' };
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

        let prices = this.priceHistory.get(market.yesTokenId);
        if (!prices) {
          prices = [];
          this.priceHistory.set(market.yesTokenId, prices);
        }
        prices.push(ba.mid);
        if (prices.length > this.cfg.trendWindow * 5) {
          prices.splice(0, prices.length - this.cfg.trendWindow * 5);
        }

        if (prices.length < this.cfg.trendWindow) continue;

        const obi = computeSmartOBI(book, this.cfg.smartLevels);
        const trend = getTrendDirection(prices.slice(-this.cfg.trendWindow));
        const dir = detectDivergence(obi, trend, this.cfg.obiThreshold);
        if (!dir) continue;

        const tokenId = dir === 'yes' ? market.yesTokenId : (market.noTokenId ?? market.yesTokenId);
        const entryPrice = dir === 'yes' ? ba.ask : (1 - ba.bid);
        if (entryPrice <= 0 || entryPrice >= 1) continue;

        await this.enterPosition(
          tokenId,
          market.conditionId,
          dir,
          entryPrice,
          parseFloat(this.cfg.positionSize),
        );

        logger.debug('Smart money entry', STRATEGY_NAME, {
          conditionId: market.conditionId,
          side: dir,
          obi: obi.toFixed(2),
          trend,
          mid: ba.mid.toFixed(4),
        });
      } catch (err) {
        logger.debug('Divergence scan error', STRATEGY_NAME, {
          market: market.conditionId,
          err: String(err),
        });
      }
    }
  }
}

export function createSmartMoneyDivergenceTick(deps: StrategyDeps): () => Promise<void> {
  const strategy = new SmartMoneyDivergenceStrategy(deps);
  return strategy.toTickFn();
}
