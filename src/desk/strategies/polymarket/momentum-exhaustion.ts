/**
 * Momentum Exhaustion Strategy — V2 implementation.
 *
 * Detects when price momentum is exhausting by tracking price velocity
 * deceleration coincident with increasing volume. When momentum fades
 * while volume rises, a reversal is likely. Trades against the exhausted trend.
 *
 * Entry: exhaustion detected -> short the current trend
 *   - Up-trend exhaustion (price velocity > 0 but decreasing, volume increasing) -> BUY NO
 *   - Down-trend exhaustion (price velocity < 0 but increasing, volume increasing) -> BUY YES
 * Exit: opposite exhaustion signal or stop-loss at 2x ATR
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

export interface MomentumExhaustionConfig extends BaseStrategyConfig {
  /** Window (ticks) for calculating price velocity */
  velocityWindow: number;
  /** Period for ATR calculation */
  atrPeriod: number;
  /** Stop-loss exit multiplier (x ATR) */
  atrStopMultiplier: number;
}

export const DEFAULT_CONFIG: MomentumExhaustionConfig = {
  velocityWindow: 5,
  atrPeriod: 8,
  atrStopMultiplier: 2.0,
  minVolume: 2000,
  takeProfitPct: 0.035,
  stopLossPct: 0.10, // generous; ATR-based exit handles dynamic stop
  maxHoldMs: 15 * 60_000,
  maxPositions: 3,
  cooldownMs: 120_000,
  positionSize: '15',
};

const STRATEGY_NAME: StrategyName = 'momentum-exhaustion';

// ---------------------------------------------------------------------------
// Pure helpers (exported for testing)
// ---------------------------------------------------------------------------

/** Average (mean) rate of change over the last `window` ticks. */
export function calcVelocity(values: number[], window: number): number {
  if (values.length < window + 1) return 0;
  return (values[values.length - 1] - values[values.length - 1 - window]) / window;
}

/** Average per-tick volume delta over the window (cumulative volume proxy). */
export function calcVolumeRate(volumes: number[], window: number): number {
  if (volumes.length < window + 1) return 0;
  return (volumes[volumes.length - 1] - volumes[volumes.length - 1 - window]) / window;
}

/** Average True Range from a series of mid-price snapshots. */
export function calcATR(prices: number[], period: number): number {
  if (prices.length < period + 1) return 0;
  let sum = 0;
  for (let i = prices.length - period; i < prices.length; i++) {
    sum += Math.abs(prices[i] - prices[i - 1]);
  }
  return sum / period;
}

/**
 * Detect momentum exhaustion.
 *
 * @returns 'yes' (downtrend exhaustion -> buy YES for reversal up),
 *          'no'  (uptrend exhaustion -> buy NO for reversal down),
 *          null  (no exhaustion)
 */
export function detectExhaustion(
  priceVel: number,
  prevPriceVel: number,
  volumeRate: number,
): 'yes' | 'no' | null {
  // Need minimum velocity magnitude
  if (Math.abs(priceVel) < 0.0005) return null;
  // Need volume to be increasing
  if (volumeRate <= 0) return null;

  // Up-trend exhaustion: velocity positive but decelerating
  if (priceVel > 0 && priceVel < prevPriceVel) {
    return 'no';
  }
  // Down-trend exhaustion: velocity negative but improving (less negative)
  if (priceVel < 0 && priceVel > prevPriceVel) {
    return 'yes';
  }
  return null;
}

// ---------------------------------------------------------------------------
// Strategy class
// ---------------------------------------------------------------------------

export class MomentumExhaustionStrategy extends BasePolymarketStrategy {
  private readonly cfg: MomentumExhaustionConfig;
  private readonly priceHistory = new Map<string, number[]>();
  private readonly volumeHistory = new Map<string, number[]>();
  private readonly prevVelocity = new Map<string, number>();

  constructor(deps: StrategyDeps, config: Partial<MomentumExhaustionConfig> = {}) {
    const fullConfig: MomentumExhaustionConfig = { ...DEFAULT_CONFIG, ...config };
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

    const maxLen = Math.max(this.cfg.velocityWindow, this.cfg.atrPeriod) * 4;
    if (prices.length > maxLen) prices.splice(0, prices.length - maxLen);
    if (vols.length > maxLen) vols.splice(0, vols.length - maxLen);
  }

  // -----------------------------------------------------------------------
  // Custom exit
  // -----------------------------------------------------------------------

  protected getCustomExitCondition(
    pos: OpenPosition,
    currentPrice: number,
  ): { exit: boolean; reason: string } {
    const prices = this.priceHistory.get(pos.tokenId);
    const vols = this.volumeHistory.get(pos.tokenId);
    if (!prices || !vols || prices.length < this.cfg.velocityWindow + 1) {
      return { exit: false, reason: '' };
    }

    // 2x ATR stop
    const atr = calcATR(prices, this.cfg.atrPeriod);
    if (atr > 0) {
      const priceMove = Math.abs(currentPrice - pos.entryPrice);
      if (priceMove > atr * this.cfg.atrStopMultiplier) {
        return {
          exit: true,
          reason: `atr-stop (${(priceMove / atr).toFixed(2)}x ATR)`,
        };
      }
    }

    // Opposite exhaustion signal
    const priceVel = calcVelocity(prices, this.cfg.velocityWindow);
    const prevVel = this.prevVelocity.get(pos.tokenId) ?? priceVel;
    const volumeRate = calcVolumeRate(vols, this.cfg.velocityWindow);
    const signal = detectExhaustion(priceVel, prevVel, volumeRate);
    if (signal !== null && signal !== pos.side) {
      return { exit: true, reason: `opposite-exhaustion (signal=${signal})` };
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
      if ((market.volume ?? 0) < this.cfg.minVolume) continue;

      try {
        const book = await this.deps.clob.getOrderBook(market.yesTokenId);
        const ba = this.bestBidAsk(book);
        if (ba.mid <= 0 || ba.mid >= 1) continue;

        this.recordTick(market.yesTokenId, ba.mid, market.volume);
        const prices = this.priceHistory.get(market.yesTokenId) ?? [];
        const vols = this.volumeHistory.get(market.yesTokenId) ?? [];

        // Need at least velocityWindow + 2 ticks to compare prev vs current velocity
        if (prices.length < this.cfg.velocityWindow + 2) continue;

        const priceVel = calcVelocity(prices, this.cfg.velocityWindow);

        // Velocity from one tick earlier
        const prevPrices = prices.slice(0, -1);
        const prevPriceVel = prevPrices.length >= this.cfg.velocityWindow + 1
          ? calcVelocity(prevPrices, this.cfg.velocityWindow)
          : priceVel;

        const volumeRate = calcVolumeRate(vols, this.cfg.velocityWindow);

        const signal = detectExhaustion(priceVel, prevPriceVel, volumeRate);
        if (!signal) continue;

        // Store the current velocity for future exit checks
        this.prevVelocity.set(market.yesTokenId, priceVel);

        const side: 'yes' | 'no' = signal;
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

        logger.debug('Exhaustion entry', this.strategyName, {
          conditionId: market.conditionId,
          side,
          entryPrice: entryPrice.toFixed(4),
          priceVel: priceVel.toFixed(6),
          volumeRate: volumeRate.toFixed(4),
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

export function createMomentumExhaustionTick(deps: StrategyDeps): () => Promise<void> {
  const strategy = new MomentumExhaustionStrategy(deps);
  return strategy.toTickFn();
}
