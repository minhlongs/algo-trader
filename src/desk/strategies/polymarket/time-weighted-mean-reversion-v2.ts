/**
 * Time-Weighted Mean Reversion V2 — extends BasePolymarketStrategy.
 *
 * Mean reversion with time-of-day weighting. Adjusts z-score threshold
 * by per-hour multipliers. More aggressive during historically high-reversion
 * periods.
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

export interface TimeWeightedMeanReversionConfig extends BaseStrategyConfig {
  priceWindow: number;
  baseZThreshold: number;
  timeWeights: number[];
  minStdDev: number;
}

export const DEFAULT_CONFIG: TimeWeightedMeanReversionConfig = {
  priceWindow: 25,
  baseZThreshold: 2.0,
  timeWeights: Array(24).fill(1.0),
  minStdDev: 0.005,
  minVolume: 5000,
  takeProfitPct: 0.025,
  stopLossPct: 0.02,
  maxHoldMs: 20 * 60_000,
  maxPositions: 5,
  cooldownMs: 90_000,
  positionSize: '10',
};

const STRATEGY_NAME = 'time-weighted-mean-reversion' as StrategyName;

// ── Pure helpers (exported for testing) ──────────────────────────────────────

export function calcRollingMean(prices: number[]): number {
  if (prices.length === 0) return 0;
  let sum = 0;
  for (const p of prices) sum += p;
  return sum / prices.length;
}

export function calcRollingStd(prices: number[], mean: number): number {
  if (prices.length === 0) return 0;
  let sumSq = 0;
  for (const p of prices) {
    const diff = p - mean;
    sumSq += diff * diff;
  }
  return Math.sqrt(sumSq / prices.length);
}

export function calcZScore(price: number, mean: number, std: number): number {
  if (std === 0) return 0;
  return (price - mean) / std;
}

export function getTimeWeight(hour: number, weights: number[]): number {
  const idx = ((hour % 24) + 24) % 24;
  if (idx < 0 || idx >= weights.length) return 1.0;
  return weights[idx];
}

export function isSignalActive(zScore: number, baseThreshold: number, timeWeight: number): boolean {
  return Math.abs(zScore) > baseThreshold * timeWeight;
}

// ── Strategy class ───────────────────────────────────────────────────────────

export class TimeWeightedMeanReversionStrategy extends BasePolymarketStrategy {
  private readonly cfg: TimeWeightedMeanReversionConfig;
  private readonly getCurrentHour: () => number;
  private readonly priceHistory = new Map<string, number[]>();

  constructor(
    deps: StrategyDeps,
    config: Partial<TimeWeightedMeanReversionConfig> = {},
    getCurrentHour?: () => number,
  ) {
    const fullConfig: TimeWeightedMeanReversionConfig = { ...DEFAULT_CONFIG, ...config };
    super(deps, fullConfig, STRATEGY_NAME);
    this.cfg = fullConfig;
    this.getCurrentHour = getCurrentHour ?? (() => new Date().getHours());
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
        if (prices.length < 2) continue;

        const mean = calcRollingMean(prices);
        const std = calcRollingStd(prices, mean);
        if (std < this.cfg.minStdDev) continue;

        const zScore = calcZScore(ba.mid, mean, std);
        const hour = this.getCurrentHour();
        const timeWeight = getTimeWeight(hour, this.cfg.timeWeights);

        if (!isSignalActive(zScore, this.cfg.baseZThreshold, timeWeight)) continue;

        const side: 'yes' | 'no' = zScore < 0 ? 'yes' : 'no';
        const tokenId = side === 'yes' ? market.yesTokenId : (market.noTokenId ?? market.yesTokenId);
        const entryPrice = side === 'yes' ? ba.ask : (1 - ba.bid);

        await this.enterPosition(tokenId, market.conditionId, side, entryPrice,
          parseFloat(this.cfg.positionSize));

        logger.debug('Time-weighted entry', this.strategyName, {
          mean: mean.toFixed(4), std: std.toFixed(4),
          zScore: zScore.toFixed(4), hour, timeWeight: timeWeight.toFixed(2),
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

export interface TimeWeightedMeanReversionDeps extends StrategyDeps {
  config?: Partial<TimeWeightedMeanReversionConfig>;
  getCurrentHour?: () => number;
}

export function createTimeWeightedMeanReversionTick(
  deps: TimeWeightedMeanReversionDeps,
): () => Promise<void> {
  const { config, getCurrentHour, ...baseDeps } = deps;
  const strategy = new TimeWeightedMeanReversionStrategy(baseDeps, config, getCurrentHour);
  return strategy.toTickFn();
}
