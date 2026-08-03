/**
 * Funding Rate Arbitrage Strategy — V2 implementation.
 *
 * Estimates an implied funding rate from the order book dynamics on
 * Polymarket and compares it to a rolling distribution. When the rate
 * reaches an extreme percentile the strategy enters in the opposite
 * direction (high funding = expensive side, fade the premium).
 */

import type { GammaMarket } from '../../polymarket/gamma-client';
import type { RawOrderBook } from '../../polymarket/clob-client';
import type { StrategyName } from '../../core/types';
import { logger } from '../../core/logger';
import {
  BasePolymarketStrategy,
  type BaseStrategyConfig,
  type StrategyDeps,
} from './base-polymarket-strategy';
import { calcSMA, calcStdDev } from './strategy-math-helpers';

// ── Config ───────────────────────────────────────────────────────────────────

export interface FundingRateArbConfig extends BaseStrategyConfig {
  /** Rolling window for funding rate statistics */
  windowSize: number;
  /** Percentile threshold to signal extreme funding (0-1, e.g. 0.9 = top 10%) */
  extremePercentile: number;
  /** Minimum market volume */
  minVolume: number;
  /** Base position size */
  baseSizeUsdc: number;
  /** Number of markets to scan */
  scanLimit: number;
}

export const DEFAULT_CONFIG: FundingRateArbConfig = {
  windowSize: 24,
  extremePercentile: 0.9,
  minVolume: 1000,
  baseSizeUsdc: 25,
  scanLimit: 15,
  takeProfitPct: 0.025,
  stopLossPct: 0.015,
  maxHoldMs: 6 * 60_000,
  maxPositions: 2,
  cooldownMs: 90_000,
  positionSize: '25',
};

const STRATEGY_NAME: StrategyName = 'funding-rate-arb';

// ── Pure helpers ─────────────────────────────────────────────────────────────

/**
 * Estimate implied funding rate from order book.
 *
 * For binary options, funding is proxied by the bid-ask skew:
 * if the ask side is much deeper, "going long" is cheap (negative funding).
 * if the bid side is much deeper, "going long" is expensive (positive funding).
 *
 * Returns a signed value where > 0 = positive funding (longs pay shorts).
 */
export function estimateImpliedFundingRate(book: RawOrderBook): number {
  const bids = book.bids.slice(0, 5);
  const asks = book.asks.slice(0, 5);

  const bidDepth = bids.reduce((s, l) => s + parseFloat(l.price) * parseFloat(l.size), 0);
  const askDepth = asks.reduce((s, l) => s + parseFloat(l.price) * parseFloat(l.size), 0);

  const total = bidDepth + askDepth;
  if (total <= 0) return 0;

  // Normalized to [-1, 1]: positive = bid-heavy = long bias (positive implied funding)
  return (bidDepth - askDepth) / total;
}

/**
 * Compute implied funding annualized from order book pressure.
 * Scales the [-1, 1] raw value to an annualized percentage.
 */
export function annualizeFundingRate(raw: number): number {
  // Scale factor converts raw imbalance to annualized rate estimate
  return raw * 0.15; // Max ~15% annualized when book is fully skewed
}

/**
 * Calculate which percentile rank the current rate occupies.
 */
export function calcPercentile(value: number, history: number[]): number {
  if (history.length === 0) return 0.5;
  let min = Infinity;
  let max = -Infinity;
  for (const v of history) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (max === min) return 0.5;
  return Math.max(0, Math.min(1, (value - min) / (max - min)));
}

/**
 * Z-score of current implied rate relative to its history.
 */
export function calcFundingRateZScore(current: number, history: number[]): number {
  if (history.length < 3) return 0;
  const mean = calcSMA(history);
  const std = calcStdDev(history);
  if (std <= 0) return 0;
  return Math.abs(current - mean) / std;
}

// ── Strategy class ───────────────────────────────────────────────────────────

export class FundingRateArbStrategy extends BasePolymarketStrategy {
  private readonly cfg: FundingRateArbConfig;
  /** History of implied funding rate per market */
  private readonly fundingHistory = new Map<string, number[]>();

  constructor(deps: StrategyDeps, config: Partial<FundingRateArbConfig> = {}) {
    const fullConfig = { ...DEFAULT_CONFIG, ...config };
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
      if (market.volume < this.cfg.minVolume) continue;

      try {
        const book = await this.deps.clob.getOrderBook(market.yesTokenId);
        const ba = this.bestBidAsk(book);
        if (ba.mid <= 0 || ba.mid >= 1) continue;

        const rawRate = estimateImpliedFundingRate(book);
        const annualized = annualizeFundingRate(rawRate);

        let hist = this.fundingHistory.get(market.yesTokenId);
        if (!hist) { hist = []; this.fundingHistory.set(market.yesTokenId, hist); }
        hist.push(annualized);
        if (hist.length > this.cfg.windowSize * 3) {
          hist.splice(0, hist.length - this.cfg.windowSize * 3);
        }

        if (hist.length < this.cfg.windowSize) continue;

        const zScore = calcFundingRateZScore(annualized, hist);
        const percentile = calcPercentile(Math.abs(annualized), hist.map(Math.abs));

        let side: 'yes' | 'no' | null = null;

        // If funding is extremely positive — longs are crowded, fade yes
        if (percentile > this.cfg.extremePercentile) {
          // Trading the opposite direction of the funding skew
          side = rawRate > 0 ? 'no' : 'yes';
        }

        if (!side) continue;
        if (side === 'no' && !market.noTokenId) continue;

        // Only enter when Z-score confirms extreme
        if (zScore < 1.5) continue;

        const tokenId = side === 'yes' ? market.yesTokenId : market.noTokenId!;
        const entryPrice = side === 'yes' ? ba.ask : (1 - ba.bid);

        await this.enterPosition(tokenId, market.conditionId, side, entryPrice, this.cfg.baseSizeUsdc);

        logger.debug('Funding rate arb entry', STRATEGY_NAME, {
          conditionId: market.conditionId, side,
          annualizedRate: (annualized * 100).toFixed(2),
          zScore: zScore.toFixed(2), percentile: (percentile * 100).toFixed(0),
        });
      } catch (err) {
        logger.debug('Scan error', STRATEGY_NAME, { market: market.conditionId, err: String(err) });
      }
    }
  }

  async execute(): Promise<void> {
    try {
      await this.checkExits();
      const markets = await this.deps.gamma.getTrending(this.cfg.scanLimit);
      await this.scanEntries(markets);
      logger.debug('Tick complete', STRATEGY_NAME, {
        openPositions: this.positions.length,
        trackedMarkets: this.fundingHistory.size,
      });
    } catch (err) {
      logger.error('Tick failed', STRATEGY_NAME, { err: String(err) });
    }
  }
}

// ── Legacy factory ───────────────────────────────────────────────────────────

export function createFundingRateArbTick(deps: StrategyDeps): () => Promise<void> {
  const strategy = new FundingRateArbStrategy(deps);
  return strategy.toTickFn();
}
