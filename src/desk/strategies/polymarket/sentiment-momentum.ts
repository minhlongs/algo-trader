/**
 * Sentiment Momentum Strategy — V2 implementation.
 *
 * Combines trend strength (simplified ADX-like directional system) with volume
 * confirmation to trade high-conviction moves. Enters only when trend is
 * strong and volume confirms the move.
 *
 * Entry: strong trend (ADX-like score >= threshold) + volume increasing
 * Exit: trend weakening (score drops) or volume divergence
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

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface SentimentMomentumConfig extends BaseStrategyConfig {
  /** Period (ticks) for trend strength calculation */
  adxPeriod: number;
  /** Minimum trend-strength score to confirm a strong trend (0-100) */
  adxThreshold: number;
  /** Lookback (ticks) for volume confirmation comparison */
  volumeLookback: number;
  /** Minimum ticks before entry */
  minTicks: number;
}

export const DEFAULT_CONFIG: SentimentMomentumConfig = {
  adxPeriod: 10,
  adxThreshold: 25,
  volumeLookback: 5,
  minTicks: 15,
  minVolume: 0,
  takeProfitPct: 0.04,
  stopLossPct: 0.025,
  maxHoldMs: 10 * 60_000,
  maxPositions: 4,
  cooldownMs: 120_000,
  positionSize: '18',
};

const STRATEGY_NAME: StrategyName = 'sentiment-momentum';

// ---------------------------------------------------------------------------
// Pure helpers (exported for testing)
// ---------------------------------------------------------------------------

/**
 * Simplified ADX-like trend strength (0-100).
 *
 * Uses price changes over `period` ticks. +DI / -DI capture directional bias;
 * ADX = 100 * |+DI - -DI| / (+DI + -DI) measures trend intensity regardless of
 * direction. Values above `adxThreshold` indicate a strong trend.
 */
export function calcTrendStrength(prices: number[], period: number): number {
  if (prices.length < period * 2) return 0;

  // Directional movement over the recent period
  let posSum = 0;
  let negSum = 0;
  let totalSum = 0;

  for (let i = prices.length - period + 1; i < prices.length; i++) {
    const change = prices[i] - prices[i - 1];
    const absChange = Math.abs(change);
    totalSum += absChange;
    posSum += Math.max(change, 0);
    negSum += Math.max(-change, 0);
  }

  if (totalSum === 0) return 0;

  const plusDI = (posSum / totalSum) * 100;
  const minusDI = (negSum / totalSum) * 100;
  const sumDI = plusDI + minusDI;

  if (sumDI === 0) return 0;
  return (Math.abs(plusDI - minusDI) / sumDI) * 100;
}

/** Direction: 'yes' if +DI > -DI, 'no' if -DI > +DI, null if unclear. */
export function calcDirection(prices: number[], period: number): 'yes' | 'no' | null {
  if (prices.length < period * 2) return null;

  let posSum = 0;
  let negSum = 0;

  for (let i = prices.length - period + 1; i < prices.length; i++) {
    const change = prices[i] - prices[i - 1];
    posSum += Math.max(change, 0);
    negSum += Math.max(-change, 0);
  }

  if (posSum > negSum) return 'yes';
  if (negSum > posSum) return 'no';
  return null;
}

/**
 * Volume confirmation: compare recent average volume delta to prior period.
 * Returns true when recent volume exceeds the prior period, confirming trend
 * strength.
 */
export function detectVolumeConfirmation(volumes: number[], lookback: number): boolean {
  if (volumes.length < lookback * 2) return true; // not enough data — pass through

  const recent = volumes.slice(-lookback);
  const prior = volumes.slice(-lookback * 2, -lookback);
  const recentAvg = recent.reduce((s, v) => s + v, 0) / lookback;
  const priorAvg = prior.reduce((s, v) => s + v, 0) / lookback;

  return recentAvg >= priorAvg;
}

// ---------------------------------------------------------------------------
// Strategy class
// ---------------------------------------------------------------------------

export class SentimentMomentumStrategy extends BasePolymarketStrategy {
  private readonly cfg: SentimentMomentumConfig;
  private readonly priceHistory = new Map<string, number[]>();
  private readonly volumeHistory = new Map<string, number[]>();
  private readonly prevTrendStrength = new Map<string, number>();

  constructor(deps: StrategyDeps, config: Partial<SentimentMomentumConfig> = {}) {
    const fullConfig: SentimentMomentumConfig = { ...DEFAULT_CONFIG, ...config };
    super(deps, fullConfig, STRATEGY_NAME);
    this.cfg = fullConfig;
  }

  private recordTick(tokenId: string, price: number, volume: number): void {
    let prices = this.priceHistory.get(tokenId);
    if (!prices) {
      prices = [];
      this.priceHistory.set(tokenId, prices);
    }
    prices.push(price);

    let vols = this.volumeHistory.get(tokenId);
    if (!vols) {
      vols = [];
      this.volumeHistory.set(tokenId, vols);
    }
    vols.push(volume);

    const maxLen = this.cfg.adxPeriod * 4;
    if (prices.length > maxLen) prices.splice(0, prices.length - maxLen);
    if (vols.length > maxLen) vols.splice(0, vols.length - maxLen);
  }

  // -----------------------------------------------------------------------
  // Custom exit
  // -----------------------------------------------------------------------

  protected getCustomExitCondition(
    pos: OpenPosition,
    _currentPrice: number,
  ): { exit: boolean; reason: string } {
    const prices = this.priceHistory.get(pos.tokenId);
    const vols = this.volumeHistory.get(pos.tokenId);
    if (!prices || !vols || prices.length < this.cfg.adxPeriod * 2) {
      return { exit: false, reason: '' };
    }

    const strength = calcTrendStrength(prices, this.cfg.adxPeriod);
    const prevStrength = this.prevTrendStrength.get(pos.tokenId);

    // Trend weakening: strength dropped significantly and is below threshold
    if (prevStrength !== undefined && strength < prevStrength * 0.7 && strength < this.cfg.adxThreshold) {
      return {
        exit: true,
        reason: `trend-weakening (${prevStrength.toFixed(1)} -> ${strength.toFixed(1)})`,
      };
    }

    // Volume divergence: volume decreasing relative to prior period
    if (vols.length >= this.cfg.volumeLookback * 2 && !detectVolumeConfirmation(vols, this.cfg.volumeLookback)) {
      return { exit: true, reason: 'volume-divergence' };
    }

    return { exit: false, reason: '' };
  }

  // -----------------------------------------------------------------------
  // Entry scanning
  // -----------------------------------------------------------------------

  protected async scanEntries(markets: GammaMarket[]): Promise<void> {
    if (this.getPositionCount() >= this.cfg.maxPositions) return;

    for (const market of markets) {
      if (this.getPositionCount() >= this.cfg.maxPositions) break;
      if (!market.yesTokenId || market.closed || market.resolved) continue;
      if (this.hasPosition(market.conditionId)) continue;
      if (this.isOnCooldown(market.conditionId)) continue;

      try {
        const book = await this.deps.clob.getOrderBook(market.yesTokenId);
        const ba = this.bestBidAsk(book);
        if (ba.mid <= 0 || ba.mid >= 1) continue;

        this.recordTick(market.yesTokenId, ba.mid, market.volume);
        const prices = this.priceHistory.get(market.yesTokenId) ?? [];
        const vols = this.volumeHistory.get(market.yesTokenId) ?? [];

        if (prices.length < this.cfg.minTicks) continue;

        const strength = calcTrendStrength(prices, this.cfg.adxPeriod);
        this.prevTrendStrength.set(market.yesTokenId, strength);

        // Check trend strength threshold
        if (strength < this.cfg.adxThreshold) continue;

        // Get directional bias
        const dir = calcDirection(prices, this.cfg.adxPeriod);
        if (!dir) continue;

        // Check volume confirmation
        if (!detectVolumeConfirmation(vols, this.cfg.volumeLookback)) continue;

        const side: 'yes' | 'no' = dir;
        const tokenId = side === 'yes'
          ? market.yesTokenId
          : (market.noTokenId ?? market.yesTokenId);
        const entryPrice = side === 'yes' ? ba.ask : (1 - ba.bid);
        if (entryPrice <= 0 || entryPrice >= 1) continue;

        await this.enterPosition(
          tokenId,
          market.conditionId,
          side,
          entryPrice,
          parseFloat(this.cfg.positionSize),
        );

        logger.debug('Sentiment momentum entry', this.strategyName, {
          conditionId: market.conditionId,
          side,
          entryPrice: entryPrice.toFixed(4),
          trendStrength: strength.toFixed(1),
        });
      } catch (err) {
        logger.debug('Scan error', this.strategyName, {
          market: market.conditionId,
          err: String(err),
        });
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Legacy factory
// ---------------------------------------------------------------------------

export function createSentimentMomentumTick(deps: StrategyDeps): () => Promise<void> {
  const strategy = new SentimentMomentumStrategy(deps);
  return strategy.toTickFn();
}
