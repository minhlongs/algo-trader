/**
 * VWAP Deviation Sniper V2 — extends BasePolymarketStrategy.
 *
 * Trades mean reversion when price deviates significantly from VWAP.
 * Oversold (z-score < -threshold) → BUY YES. Overbought (z-score > threshold) → BUY NO.
 * Custom exit: closes position when price reverts to within exitThreshold of VWAP.
 */

import type { GammaMarket } from '../../polymarket/gamma-client';
import type { StrategyName } from '../../core/types';
import { logger } from '../../core/logger';
import {
  BasePolymarketStrategy,
  type BaseStrategyConfig,
  type OpenPosition,
  type StrategyDeps,
} from './base-polymarket-strategy';

// ── Config ───────────────────────────────────────────────────────────────────

export interface VwapDeviationSniperConfig extends BaseStrategyConfig {
  vwapWindow: number;
  minPeriods: number;
  deviationThreshold: number;
  exitThreshold: number;
}

export const DEFAULT_CONFIG: VwapDeviationSniperConfig = {
  vwapWindow: 20,
  minPeriods: 10,
  deviationThreshold: 2.0,
  exitThreshold: 0.5,
  minVolume: 5000,
  takeProfitPct: 0.03,
  stopLossPct: 0.02,
  maxHoldMs: 20 * 60_000,
  maxPositions: 4,
  cooldownMs: 120_000,
  positionSize: '12',
};

const STRATEGY_NAME = 'vwap-deviation-sniper' as StrategyName;

// ── Pure helpers (exported for testing) ──────────────────────────────────────

export function calcVWAP(prices: number[], volumes: number[]): number {
  if (prices.length === 0 || volumes.length === 0) return 0;
  if (prices.length !== volumes.length) return 0;

  let sumPV = 0;
  let sumV = 0;

  for (let i = 0; i < prices.length; i++) {
    if (volumes[i] <= 0) continue;
    sumPV += prices[i] * volumes[i];
    sumV += volumes[i];
  }

  if (sumV === 0) return 0;
  return sumPV / sumV;
}

export function calcDeviation(price: number, vwap: number): number {
  if (vwap === 0) return 0;
  return (price - vwap) / vwap;
}

export function calcStdDev(values: number[], mean: number): number {
  if (values.length === 0) return 0;
  let sumSq = 0;
  for (const x of values) {
    const diff = x - mean;
    sumSq += diff * diff;
  }
  return Math.sqrt(sumSq / values.length);
}

export function calcZScore(value: number, history: number[]): number {
  if (history.length < 2) return 0;
  const mean = history.reduce((a, b) => a + b, 0) / history.length;
  const stdDev = calcStdDev(history, mean);
  if (stdDev === 0) return 0;
  return (value - mean) / stdDev;
}

export function determineSignal(
  zScore: number,
  threshold: number,
): 'yes' | 'no' | null {
  if (zScore < -threshold) return 'yes';
  if (zScore > threshold) return 'no';
  return null;
}

// ── Strategy class ───────────────────────────────────────────────────────────

export class VwapDeviationSniperStrategy extends BasePolymarketStrategy {
  private readonly cfg: VwapDeviationSniperConfig;
  private readonly priceHistory = new Map<string, number[]>();
  private readonly volumeHistory = new Map<string, number[]>();

  constructor(deps: StrategyDeps, config: Partial<VwapDeviationSniperConfig> = {}) {
    const fullConfig: VwapDeviationSniperConfig = { ...DEFAULT_CONFIG, ...config };
    super(deps, fullConfig, STRATEGY_NAME);
    this.cfg = fullConfig;
  }

  private recordPriceVolume(tokenId: string, price: number, volume: number): void {
    let prices = this.priceHistory.get(tokenId);
    let volumes = this.volumeHistory.get(tokenId);
    if (!prices) { prices = []; this.priceHistory.set(tokenId, prices); }
    if (!volumes) { volumes = []; this.volumeHistory.set(tokenId, volumes); }

    prices.push(price);
    volumes.push(volume);

    if (prices.length > this.cfg.vwapWindow) {
      prices.splice(0, prices.length - this.cfg.vwapWindow);
      volumes.splice(0, volumes.length - this.cfg.vwapWindow);
    }
  }

  /** Custom exit: close position when price reverts to VWAP (|deviation| < exitThreshold). */
  protected getCustomExitCondition(pos: OpenPosition, currentPrice: number): { exit: boolean; reason: string } {
    const prices = this.priceHistory.get(pos.tokenId) ?? [];
    const volumes = this.volumeHistory.get(pos.tokenId) ?? [];
    if (prices.length === 0) return { exit: false, reason: '' };

    const vwap = calcVWAP(prices, volumes);
    if (vwap === 0) return { exit: false, reason: '' };

    const deviation = calcDeviation(currentPrice, vwap);
    if (Math.abs(deviation) < this.cfg.exitThreshold) {
      return { exit: true, reason: `mean reversion (deviation: ${deviation.toFixed(4)}, vwap: ${vwap.toFixed(4)})` };
    }
    return { exit: false, reason: '' };
  }

  private estimateDepthVolume(book: { bids: Array<{ size: string }>; asks: Array<{ size: string }> }, levels: number = 10): number {
    let volume = 0;
    const limit = Math.min(levels, book.bids.length, book.asks.length);
    for (let i = 0; i < limit; i++) {
      volume += parseFloat(book.bids[i].size) + parseFloat(book.asks[i].size);
    }
    return volume;
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

        const depthVolume = this.estimateDepthVolume(book, 10);
        const volume = Math.max(market.volume ?? 0, depthVolume);

        this.recordPriceVolume(market.yesTokenId, ba.mid, volume);
        const prices = this.priceHistory.get(market.yesTokenId) ?? [];

        if (prices.length < this.cfg.minPeriods) continue;

        const zScore = calcZScore(ba.mid, prices);
        const signal = determineSignal(zScore, this.cfg.deviationThreshold);
        if (signal === null) continue;

        const side: 'yes' | 'no' = signal;
        const tokenId = side === 'yes' ? market.yesTokenId : (market.noTokenId ?? market.yesTokenId);
        const entryPrice = side === 'yes' ? ba.ask : (1 - ba.bid);

        if (entryPrice <= 0 || entryPrice >= 1) continue;

        await this.enterPosition(tokenId, market.conditionId, side, entryPrice,
          parseFloat(this.cfg.positionSize));

        const volumes = this.volumeHistory.get(market.yesTokenId) ?? [];
        const vwap = calcVWAP(prices, volumes);
        logger.debug('VWAP deviation entry', this.strategyName, {
          vwap: vwap.toFixed(4),
          deviation: calcDeviation(ba.mid, vwap).toFixed(4),
          zScore: zScore.toFixed(4),
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

export interface VwapDeviationSniperDeps extends StrategyDeps {
  config?: Partial<VwapDeviationSniperConfig>;
}

export function createVwapDeviationSniperTick(deps: VwapDeviationSniperDeps): () => Promise<void> {
  const { config, ...baseDeps } = deps;
  const strategy = new VwapDeviationSniperStrategy(baseDeps, config);
  return strategy.toTickFn();
}
