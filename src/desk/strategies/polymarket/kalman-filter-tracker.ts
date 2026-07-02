/**
 * Kalman Filter Tracker Strategy — V2 implementation.
 *
 * Applies a Kalman filter to estimate the hidden "true" price state
 * from noisy observed prices. When the observed price diverges from
 * the filtered estimate by more than a configurable standard deviation
 * threshold, the strategy enters a position betting on convergence.
 */

import type { GammaMarket } from '../../polymarket/gamma-client';
import type { StrategyName } from '../../core/types';
import { logger } from '../../core/logger';
import {
  BasePolymarketStrategy,
  type BaseStrategyConfig,
  type StrategyDeps,
} from './base-polymarket-strategy';
import { calcStdDev } from './strategy-math-helpers';

// ── Config ───────────────────────────────────────────────────────────────────

export interface KalmanFilterConfig extends BaseStrategyConfig {
  /** Process noise variance (Q) — how much the true price can change per step */
  processNoise: number;
  /** Measurement noise variance (R) — how noisy the observed price is */
  measurementNoise: number;
  /** Number of standard deviations of residual to trigger entry */
  entryStdDev: number;
  /** Residual must also exceed this absolute value (in price units) */
  minResidual: number;
  /** Window for residual standard deviation tracking */
  residualWindow: number;
  /** Minimum market volume */
  minVolume: number;
  /** Base position size */
  baseSizeUsdc: number;
  /** Markets to scan */
  scanLimit: number;
}

export const DEFAULT_CONFIG: KalmanFilterConfig = {
  processNoise: 0.001,
  measurementNoise: 0.01,
  entryStdDev: 2.0,
  minResidual: 0.02,
  residualWindow: 20,
  minVolume: 1000,
  baseSizeUsdc: 25,
  scanLimit: 15,
  takeProfitPct: 0.025,
  stopLossPct: 0.02,
  maxHoldMs: 6 * 60_000,
  maxPositions: 2,
  cooldownMs: 90_000,
  positionSize: '25',
};

const STRATEGY_NAME: StrategyName = 'kalman-filter-tracker';

// ── Kalman Filter ───────────────────────────────────────────────────────────

/**
 * Simple 1D Kalman filter for scalar observations.
 *
 * State: estimated true price
 * Observation: market mid-price
 * Model: price follows a random walk (constant position model with process noise)
 */
export class KalmanFilter1D {
  private state: number;
  private covariance: number;

  constructor(
    private readonly processNoise: number,
    private readonly measurementNoise: number,
    initialState = 0.5,
    initialCovariance = 0.1,
  ) {
    this.state = initialState;
    this.covariance = initialCovariance;
  }

  /** Update with a new observation and return the filtered estimate. */
  update(observation: number): number {
    // Predict step (constant position model with process noise)
    this.covariance += this.processNoise;

    // Update step (Kalman gain)
    const gain = this.covariance / (this.covariance + this.measurementNoise);
    this.state += gain * (observation - this.state);
    this.covariance = (1 - gain) * this.covariance;

    return this.state;
  }

  getState(): number { return this.state; }
  getCovariance(): number { return this.covariance; }
}

// ── Pure helpers ─────────────────────────────────────────────────────────────

/**
 * Compute Z-score of current residual relative to its history.
 */
export function calcResidualZScore(residual: number, history: number[]): number {
  if (history.length < 3) return 0;
  const mean = history.reduce((s, v) => s + v, 0) / history.length;
  const std = calcStdDev(history);
  if (std <= 0) return 0;
  return Math.abs(residual - mean) / std;
}

// ── Strategy class ───────────────────────────────────────────────────────────

export class KalmanFilterTrackerStrategy extends BasePolymarketStrategy {
  private readonly cfg: KalmanFilterConfig;
  private readonly filters = new Map<string, KalmanFilter1D>();
  private readonly residualHistory = new Map<string, number[]>();

  constructor(deps: StrategyDeps, config: Partial<KalmanFilterConfig> = {}) {
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

        // Initialize filter if needed
        let filter = this.filters.get(market.yesTokenId);
        if (!filter) {
          filter = new KalmanFilter1D(
            this.cfg.processNoise,
            this.cfg.measurementNoise,
            ba.mid,
          );
          this.filters.set(market.yesTokenId, filter);
          continue; // Need at least one more observation for residual
        }

        const filtered = filter.update(ba.mid);
        const residual = ba.mid - filtered;

        // Track residual history for Z-score
        let resHist = this.residualHistory.get(market.yesTokenId);
        if (!resHist) { resHist = []; this.residualHistory.set(market.yesTokenId, resHist); }
        resHist.push(Math.abs(residual));
        if (resHist.length > this.cfg.residualWindow * 3) {
          resHist.splice(0, resHist.length - this.cfg.residualWindow * 3);
        }

        if (resHist.length < 3) continue;

        const zScore = calcResidualZScore(residual, resHist);
        const absResidual = Math.abs(residual);

        if (absResidual < this.cfg.minResidual) continue;
        if (zScore < this.cfg.entryStdDev) continue;

        // Residual is significant — price has diverged from filtered estimate
        // Bet on convergence: if price > filtered, it's overpriced -> bet no
        // If price < filtered, it's underpriced -> bet yes
        const side = residual > 0 ? 'no' : 'yes';
        if (side === 'no' && !market.noTokenId) continue;

        const tokenId = side === 'yes' ? market.yesTokenId : market.noTokenId!;
        const entryPrice = side === 'yes' ? ba.ask : (1 - ba.bid);

        await this.enterPosition(tokenId, market.conditionId, side, entryPrice, this.cfg.baseSizeUsdc);

        logger.debug('Kalman filter entry', STRATEGY_NAME, {
          conditionId: market.conditionId, side,
          observed: ba.mid.toFixed(4), filtered: filtered.toFixed(4),
          residual: residual.toFixed(4), zScore: zScore.toFixed(2),
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
        trackedFilters: this.filters.size,
      });
    } catch (err) {
      logger.error('Tick failed', STRATEGY_NAME, { err: String(err) });
    }
  }
}

// ── Legacy factory ───────────────────────────────────────────────────────────

export function createKalmanFilterTrackerTick(deps: StrategyDeps): () => Promise<void> {
  const strategy = new KalmanFilterTrackerStrategy(deps);
  return strategy.toTickFn();
}
