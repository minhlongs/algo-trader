/**
 * Session Volatility Sniper Strategy — V2 implementation.
 *
 * Detects intraday volatility spikes by comparing current ATR to its
 * rolling average. A spike above 2x the rolling average signals a
 * directional continuation opportunity. Trades in the direction of the spike.
 *
 * Entry: ATR spike (current ATR > rollingAvgATR x multiplier) -> trade in spike direction
 * Exit: volatility mean-reversion (short ATR drops to avg) or session time-stop
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

export interface SessionVolSniperConfig extends BaseStrategyConfig {
  /** Window (ticks) for short-horizon ATR */
  shortAtrWindow: number;
  /** Window (ticks) for rolling average ATR */
  longAtrWindow: number;
  /** Spike detection multiplier (x rollingAvgATR) */
  spikeMultiplier: number;
  /** Minimum number of ticks before entry */
  minTicks: number;
  /** Session duration in ms (time-stop) */
  sessionDurationMs: number;
}

export const DEFAULT_CONFIG: SessionVolSniperConfig = {
  shortAtrWindow: 5,
  longAtrWindow: 20,
  spikeMultiplier: 2.0,
  minTicks: 21, // longAtrWindow + 1 price points for first ATR
  sessionDurationMs: 6 * 60 * 60 * 1000, // 6-hour session
  minVolume: 0,
  takeProfitPct: 0.04,
  stopLossPct: 0.02,
  maxHoldMs: 6 * 60 * 60 * 1000,
  maxPositions: 3,
  cooldownMs: 180_000,
  positionSize: '20',
};

const STRATEGY_NAME: StrategyName = 'session-vol-sniper';

// ---------------------------------------------------------------------------
// Pure helpers (exported for testing)
// ---------------------------------------------------------------------------

/** Average True Range from a series of mid-price snapshots. */
export function calcATR(prices: number[], period: number): number {
  if (prices.length < period + 1) return 0;
  let sum = 0;
  for (let i = prices.length - period; i < prices.length; i++) {
    sum += Math.abs(prices[i] - prices[i - 1]);
  }
  return sum / period;
}

/** Simple arithmetic mean. */
export function calcAverage(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

/** Check if short ATR exceeds long-run average by the multiplier. */
export function detectSpike(shortAtr: number, longAvgAtr: number, multiplier: number): boolean {
  if (longAvgAtr <= 0) return false;
  return shortAtr >= longAvgAtr * multiplier;
}

/** Check if short ATR has mean-reverted to at or below the long average. */
export function detectMeanReversion(shortAtr: number, longAvgAtr: number): boolean {
  return longAvgAtr > 0 && shortAtr <= longAvgAtr;
}

// ---------------------------------------------------------------------------
// Strategy class
// ---------------------------------------------------------------------------

export class SessionVolSniperStrategy extends BasePolymarketStrategy {
  private readonly cfg: SessionVolSniperConfig;
  private readonly priceHistory = new Map<string, number[]>();

  constructor(deps: StrategyDeps, config: Partial<SessionVolSniperConfig> = {}) {
    const fullConfig: SessionVolSniperConfig = { ...DEFAULT_CONFIG, ...config };
    super(deps, fullConfig, STRATEGY_NAME);
    this.cfg = fullConfig;
  }

  private recordTick(tokenId: string, price: number): void {
    let prices = this.priceHistory.get(tokenId);
    if (!prices) {
      prices = [];
      this.priceHistory.set(tokenId, prices);
    }
    prices.push(price);
    const maxLen = this.cfg.longAtrWindow * 4;
    if (prices.length > maxLen) prices.splice(0, prices.length - maxLen);
  }

  /** Compute average ATR across a range of window sizes to get a stable baseline. */
  private calcAvgAtr(prices: number[]): number {
    const atrs: number[] = [];
    for (let w = this.cfg.shortAtrWindow; w <= this.cfg.longAtrWindow; w++) {
      const atr = calcATR(prices, w);
      if (atr > 0) atrs.push(atr);
    }
    return calcAverage(atrs);
  }

  // -----------------------------------------------------------------------
  // Custom exit
  // -----------------------------------------------------------------------

  protected getCustomExitCondition(
    pos: OpenPosition,
    _currentPrice: number,
  ): { exit: boolean; reason: string } {
    const prices = this.priceHistory.get(pos.tokenId);
    if (!prices || prices.length < this.cfg.longAtrWindow + 1) {
      return { exit: false, reason: '' };
    }

    // Volatility mean-reversion: short ATR drops to or below the long average
    const shortAtr = calcATR(prices, this.cfg.shortAtrWindow);
    const longAvgAtr = this.calcAvgAtr(prices);
    if (detectMeanReversion(shortAtr, longAvgAtr)) {
      return {
        exit: true,
        reason: `vol-mean-reversion (short=${shortAtr.toFixed(4)}, avg=${longAvgAtr.toFixed(4)})`,
      };
    }

    // Time-stop: end of session
    const elapsed = Date.now() - pos.openedAt;
    if (elapsed >= this.cfg.sessionDurationMs) {
      return { exit: true, reason: 'session-time-stop' };
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

        this.recordTick(market.yesTokenId, ba.mid);
        const prices = this.priceHistory.get(market.yesTokenId) ?? [];
        if (prices.length < this.cfg.minTicks) continue;

        const shortAtr = calcATR(prices, this.cfg.shortAtrWindow);
        const longAvgAtr = this.calcAvgAtr(prices);

        if (!detectSpike(shortAtr, longAvgAtr, this.cfg.spikeMultiplier)) continue;

        // Determine direction from recent price movement relative to the short window start
        const shortSlice = prices.slice(-this.cfg.shortAtrWindow);
        const direction = shortSlice[shortSlice.length - 1] >= shortSlice[0] ? 'yes' : 'no';

        const side: 'yes' | 'no' = direction;
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

        logger.debug('Vol spike entry', this.strategyName, {
          conditionId: market.conditionId,
          side,
          entryPrice: entryPrice.toFixed(4),
          shortAtr: shortAtr.toFixed(4),
          longAvgAtr: longAvgAtr.toFixed(4),
          spikeRatio: (shortAtr / longAvgAtr).toFixed(2),
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

export function createSessionVolSniperTick(deps: StrategyDeps): () => Promise<void> {
  const strategy = new SessionVolSniperStrategy(deps);
  return strategy.toTickFn();
}
