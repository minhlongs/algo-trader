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

// ── Pure helpers (exported for testing) ──────────────────────────────────────

export function buildPriceBins(
  prices: number[],
  numBins: number,
): { counts: number[]; binLow: number; binWidth: number } {
  if (prices.length === 0) {
    return { counts: new Array(numBins).fill(0), binLow: 0, binWidth: 0 };
  }

  let min = prices[0];
  let max = prices[0];
  for (const p of prices) {
    if (p < min) min = p;
    if (p > max) max = p;
  }

  if (max === min) {
    const counts = new Array(numBins).fill(0);
    counts[0] = prices.length;
    return { counts, binLow: min, binWidth: 0 };
  }

  const binWidth = (max - min) / numBins;
  const counts = new Array(numBins).fill(0);

  for (const p of prices) {
    let idx = Math.floor((p - min) / binWidth);
    if (idx >= numBins) idx = numBins - 1;
    counts[idx]++;
  }

  return { counts, binLow: min, binWidth };
}

export function findDensestCluster(
  counts: number[],
): { startBin: number; endBin: number; totalCount: number } {
  if (counts.length === 0) return { startBin: 0, endBin: 0, totalCount: 0 };

  let bestStart = 0;
  let bestEnd = 0;
  let bestTotal = counts[0];

  for (let start = 0; start < counts.length; start++) {
    let total = 0;
    for (let end = start; end < counts.length; end++) {
      total += counts[end];
      if (total > bestTotal) {
        bestTotal = total;
        bestStart = start;
        bestEnd = end;
      }
    }
  }

  return { startBin: bestStart, endBin: bestEnd, totalCount: bestTotal };
}

export function calcClusterBounds(
  startBin: number, endBin: number, binLow: number, binWidth: number,
): { low: number; high: number } {
  return {
    low: binLow + startBin * binWidth,
    high: binLow + (endBin + 1) * binWidth,
  };
}

export function detectClusterBreakout(
  price: number, low: number, high: number,
): 'bullish' | 'bearish' | null {
  if (price > high) return 'bullish';
  if (price < low) return 'bearish';
  return null;
}

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
