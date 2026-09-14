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
  type StrategyDeps,
} from './base-polymarket-strategy';
import {
  type KalmanFilterConfig,
  DEFAULT_CONFIG,
  KalmanFilter1D,
  calcResidualZScore,
} from './kalman-filter-core';

// Re-export configuration and core Kalman math for 100% backward compatibility
export type { KalmanFilterConfig } from './kalman-filter-core';
export { DEFAULT_CONFIG, KalmanFilter1D, calcResidualZScore } from './kalman-filter-core';

const STRATEGY_NAME: StrategyName = 'kalman-filter-tracker';

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
