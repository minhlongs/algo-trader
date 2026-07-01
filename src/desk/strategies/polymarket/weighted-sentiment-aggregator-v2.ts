/**
 * Weighted Sentiment Aggregator V2 — extends BasePolymarketStrategy.
 *
 * Aggregates multiple market microstructure signals into a single weighted
 * sentiment score: book imbalance, price velocity, volume trend.
 * Trades when the composite score exceeds a threshold.
 *
 * score > threshold → BUY YES. score < -threshold → BUY NO.
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

export interface WeightedSentimentAggregatorConfig extends BaseStrategyConfig {
  wImbalance: number;
  wVelocity: number;
  wVolume: number;
  scoreThreshold: number;
  velocityWindow: number;
  volumeWindow: number;
}

export const DEFAULT_CONFIG: WeightedSentimentAggregatorConfig = {
  wImbalance: 0.4,
  wVelocity: 0.35,
  wVolume: 0.25,
  scoreThreshold: 0.15,
  velocityWindow: 5,
  volumeWindow: 10,
  minVolume: 5000,
  takeProfitPct: 0.025,
  stopLossPct: 0.02,
  maxHoldMs: 15 * 60_000,
  maxPositions: 5,
  cooldownMs: 90_000,
  positionSize: '10',
};

const STRATEGY_NAME = 'weighted-sentiment-aggregator' as StrategyName;

// ── Pure helpers (exported for testing) ──────────────────────────────────────

export function calcBookImbalance(bidSize: number, askSize: number): number {
  const total = bidSize + askSize;
  if (total === 0) return 0;
  return (bidSize - askSize) / total;
}

export function calcPriceVelocity(prices: number[]): number {
  if (prices.length < 2) return 0;
  const first = prices[0];
  if (first === 0) return 0;
  return (prices[prices.length - 1] - first) / first;
}

export function calcVolumeTrend(currentVol: number, avgVol: number): number {
  if (avgVol === 0) return 0;
  return currentVol / avgVol;
}

export function calcCompositeScore(
  imbalance: number,
  velocity: number,
  volumeTrend: number,
  config: Pick<WeightedSentimentAggregatorConfig, 'wImbalance' | 'wVelocity' | 'wVolume'>,
): number {
  return (
    config.wImbalance * imbalance +
    config.wVelocity * velocity +
    config.wVolume * (volumeTrend - 1)
  );
}

export function determineSignal(score: number, threshold: number): 'yes' | 'no' | null {
  if (score > threshold) return 'yes';
  if (score < -threshold) return 'no';
  return null;
}

// ── Strategy class ───────────────────────────────────────────────────────────

export class WeightedSentimentAggregatorStrategy extends BasePolymarketStrategy {
  private readonly cfg: WeightedSentimentAggregatorConfig;
  private readonly priceHistory = new Map<string, number[]>();
  private readonly volumeHistory = new Map<string, number[]>();

  constructor(deps: StrategyDeps, config: Partial<WeightedSentimentAggregatorConfig> = {}) {
    const fullConfig: WeightedSentimentAggregatorConfig = { ...DEFAULT_CONFIG, ...config };
    super(deps, fullConfig, STRATEGY_NAME);
    this.cfg = fullConfig;
  }

  private recordPrice(tokenId: string, price: number): void {
    let history = this.priceHistory.get(tokenId);
    if (!history) { history = []; this.priceHistory.set(tokenId, history); }
    history.push(price);
    if (history.length > this.cfg.velocityWindow) {
      history.splice(0, history.length - this.cfg.velocityWindow);
    }
  }

  private recordVolume(tokenId: string, volume: number): void {
    let history = this.volumeHistory.get(tokenId);
    if (!history) { history = []; this.volumeHistory.set(tokenId, history); }
    history.push(volume);
    if (history.length > this.cfg.volumeWindow) {
      history.splice(0, history.length - this.cfg.volumeWindow);
    }
  }

  private getPrices(tokenId: string): number[] {
    return this.priceHistory.get(tokenId) ?? [];
  }

  private getAvgVolume(tokenId: string): number {
    const history = this.volumeHistory.get(tokenId) ?? [];
    if (history.length === 0) return 0;
    let sum = 0;
    for (const v of history) sum += v;
    return sum / history.length;
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

        // Calculate total bid/ask sizes from order book
        let bidSize = 0;
        for (const b of book.bids) bidSize += parseFloat(b.size);
        let askSize = 0;
        for (const a of book.asks) askSize += parseFloat(a.size);

        this.recordPrice(market.yesTokenId, ba.mid);
        const bookVolume = bidSize + askSize;
        this.recordVolume(market.yesTokenId, bookVolume);

        const imbalance = calcBookImbalance(bidSize, askSize);
        const prices = this.getPrices(market.yesTokenId);
        const velocity = calcPriceVelocity(prices);
        const avgVol = this.getAvgVolume(market.yesTokenId);
        const volumeTrend = calcVolumeTrend(bookVolume, avgVol);

        const score = calcCompositeScore(imbalance, velocity, volumeTrend, this.cfg);
        const signal = determineSignal(score, this.cfg.scoreThreshold);
        if (signal === null) continue;

        const tokenId = signal === 'yes'
          ? market.yesTokenId
          : (market.noTokenId ?? market.yesTokenId);
        const entryPrice = signal === 'yes' ? ba.ask : (1 - ba.bid);

        await this.enterPosition(tokenId, market.conditionId, signal, entryPrice,
          parseFloat(this.cfg.positionSize));

        logger.debug('Sentiment aggregator entry', this.strategyName, {
          conditionId: market.conditionId, side: signal,
          entryPrice: entryPrice.toFixed(4),
          score: score.toFixed(4), imbalance: imbalance.toFixed(4),
          velocity: velocity.toFixed(4), volumeTrend: volumeTrend.toFixed(4),
        });
      } catch (err) {
        logger.debug('Scan error', this.strategyName, { market: market.conditionId, err: String(err) });
      }
    }
  }
}

// ── Legacy factory (backward compat) ─────────────────────────────────────────

export interface WeightedSentimentAggregatorDeps extends StrategyDeps {
  config?: Partial<WeightedSentimentAggregatorConfig>;
}

export function createWeightedSentimentAggregatorTick(
  deps: WeightedSentimentAggregatorDeps,
): () => Promise<void> {
  const { config, ...baseDeps } = deps;
  const strategy = new WeightedSentimentAggregatorStrategy(baseDeps, config);
  return strategy.toTickFn();
}
