/**
 * Cluster Breakout V2 — extends BasePolymarketStrategy.
 *
 * Identifies price consolidation zones via density-based clustering,
 * then trades breakouts. Bullish breakout (price > cluster high) → BUY YES.
 * Bearish breakout (price < cluster low) → BUY NO.
 */

import type { GammaMarket } from '../../polymarket/gamma-client';
import type { StrategyName } from '../../core/types';
import { logger } from '../../core/logger';
import {
  BasePolymarketStrategy,
  type BaseStrategyConfig,
  type StrategyDeps,
} from './base-polymarket-strategy';
import {
  buildPriceBins,
  findDensestCluster,
  calcClusterBounds,
  detectClusterBreakout,
} from './cluster-breakout-math';

export {
  buildPriceBins,
  findDensestCluster,
  calcClusterBounds,
  detectClusterBreakout,
};

// ── Config ───────────────────────────────────────────────────────────────────

export interface ClusterBreakoutConfig extends BaseStrategyConfig {
  numBins: number;
  minClusterPct: number;
  priceWindow: number;
}

export const DEFAULT_CONFIG: ClusterBreakoutConfig = {
  numBins: 15,
  minClusterPct: 0.5,
  priceWindow: 25,
  minVolume: 5000,
  takeProfitPct: 0.03,
  stopLossPct: 0.02,
  maxHoldMs: 15 * 60_000,
  maxPositions: 4,
  cooldownMs: 120_000,
  positionSize: '10',
};

const STRATEGY_NAME = 'cluster-breakout' as StrategyName;

// ── Strategy class ───────────────────────────────────────────────────────────

export class ClusterBreakoutStrategy extends BasePolymarketStrategy {
  private readonly cfg: ClusterBreakoutConfig;
  private readonly priceHistory = new Map<string, number[]>();

  constructor(deps: StrategyDeps, config: Partial<ClusterBreakoutConfig> = {}) {
    const fullConfig: ClusterBreakoutConfig = { ...DEFAULT_CONFIG, ...config };
    super(deps, fullConfig, STRATEGY_NAME);
    this.cfg = fullConfig;
  }

  private recordPrice(tokenId: string, price: number): void {
    let history = this.priceHistory.get(tokenId);
    if (!history) {
      history = [];
      this.priceHistory.set(tokenId, history);
    }
    history.push(price);
    if (history.length > this.cfg.priceWindow) {
      history.splice(0, history.length - this.cfg.priceWindow);
    }
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

        this.recordPrice(market.yesTokenId, ba.mid);
        const prices = this.priceHistory.get(market.yesTokenId) ?? [];
        if (prices.length < this.cfg.numBins) continue;

        const { counts, binLow, binWidth } = buildPriceBins(prices, this.cfg.numBins);
        if (binWidth === 0) continue;

        const { startBin, endBin, totalCount } = findDensestCluster(counts);
        if (totalCount / prices.length <= this.cfg.minClusterPct) continue;

        const { low, high } = calcClusterBounds(startBin, endBin, binLow, binWidth);
        const breakout = detectClusterBreakout(ba.mid, low, high);
        if (breakout === null) continue;

        const side: 'yes' | 'no' = breakout === 'bullish' ? 'yes' : 'no';
        const tokenId = side === 'yes' ? market.yesTokenId : (market.noTokenId ?? market.yesTokenId);
        const entryPrice = side === 'yes' ? ba.ask : (1 - ba.bid);

        await this.enterPosition(tokenId, market.conditionId, side, entryPrice,
          parseFloat(this.cfg.positionSize));

        logger.debug('Cluster breakout entry', this.strategyName, {
          clusterLow: low.toFixed(4), clusterHigh: high.toFixed(4), breakout,
        });
      } catch (err) {
        logger.debug('Scan error', this.strategyName, {
          market: market.conditionId, err: String(err),
        });
      }
    }
  }
}

// ── Legacy factory (backward compat) ─────────────────────────────────────────

export interface ClusterBreakoutDeps extends StrategyDeps {
  config?: Partial<ClusterBreakoutConfig>;
}

export function createClusterBreakoutTick(deps: ClusterBreakoutDeps): () => Promise<void> {
  const { config, ...baseDeps } = deps;
  const strategy = new ClusterBreakoutStrategy(baseDeps, config);
  return strategy.toTickFn();
}
