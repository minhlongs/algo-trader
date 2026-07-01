/**
 * Cross-Correlation Lag V2 — extends BasePolymarketStrategy.
 *
 * Detects lead-lag relationships between markets via cross-correlation
 * analysis. When market A's price changes predict market B's future
 * changes, trades the lagging market based on the leader's recent move.
 *
 * Uses gamma.getEvents() instead of getTrending() — overrides execute().
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

export interface CrossCorrelationLagConfig extends BaseStrategyConfig {
  maxLag: number;
  minCorrelation: number;
  predictionThreshold: number;
  priceWindow: number;
  minMarketsPerEvent: number;
}

export const DEFAULT_CONFIG: CrossCorrelationLagConfig = {
  maxLag: 5,
  minCorrelation: 0.6,
  predictionThreshold: 0.02,
  priceWindow: 20,
  minMarketsPerEvent: 2,
  minVolume: 5000,
  takeProfitPct: 0.025,
  stopLossPct: 0.02,
  maxHoldMs: 15 * 60_000,
  maxPositions: 4,
  cooldownMs: 120_000,
  positionSize: '10',
};

const STRATEGY_NAME = 'cross-correlation-lag' as StrategyName;

// ── Pure helpers (exported for testing) ──────────────────────────────────────

export function calcPearsonCorrelation(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length);
  if (n < 2) return 0;

  let sumX = 0, sumY = 0;
  for (let i = 0; i < n; i++) { sumX += x[i]; sumY += y[i]; }
  const meanX = sumX / n;
  const meanY = sumY / n;

  let covXY = 0, varX = 0, varY = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - meanX;
    const dy = y[i] - meanY;
    covXY += dx * dy;
    varX += dx * dx;
    varY += dy * dy;
  }

  if (varX === 0 || varY === 0) return 0;
  return covXY / Math.sqrt(varX * varY);
}

export function calcCrossCorrelation(seriesA: number[], seriesB: number[], lag: number): number {
  if (lag < 0) return 0;
  const n = Math.min(seriesA.length, seriesB.length) - lag;
  if (n < 2) return 0;
  return calcPearsonCorrelation(seriesA.slice(0, n), seriesB.slice(lag, lag + n));
}

export function findBestLag(
  seriesA: number[], seriesB: number[], maxLag: number,
): { lag: number; correlation: number } {
  let bestLag = 0, bestCorr = 0;
  for (let lag = 1; lag <= maxLag; lag++) {
    const corr = calcCrossCorrelation(seriesA, seriesB, lag);
    if (Math.abs(corr) > Math.abs(bestCorr)) { bestCorr = corr; bestLag = lag; }
  }
  return { lag: bestLag, correlation: bestCorr };
}

export function predictMove(leaderPrices: number[], lag: number): number {
  if (lag <= 0 || leaderPrices.length < lag + 1) return 0;
  return leaderPrices[leaderPrices.length - 1] - leaderPrices[leaderPrices.length - 1 - lag];
}

// ── Strategy class ───────────────────────────────────────────────────────────

export class CrossCorrelationLagStrategy extends BasePolymarketStrategy {
  private readonly cfg: CrossCorrelationLagConfig;
  private readonly priceHistory = new Map<string, number[]>();

  constructor(deps: StrategyDeps, config: Partial<CrossCorrelationLagConfig> = {}) {
    const fullConfig: CrossCorrelationLagConfig = { ...DEFAULT_CONFIG, ...config };
    super(deps, fullConfig, STRATEGY_NAME);
    this.cfg = fullConfig;
  }

  /** Required by abstract base — unused; real entry uses scanEventEntries. */
  protected async scanEntries(_markets: GammaMarket[]): Promise<void> {
    // no-op: overridden execute() uses scanEventEntries instead
  }

  private recordPrice(tokenId: string, price: number): void {
    let history = this.priceHistory.get(tokenId);
    if (!history) { history = []; this.priceHistory.set(tokenId, history); }
    history.push(price);
    if (history.length > this.cfg.priceWindow) {
      history.splice(0, history.length - this.cfg.priceWindow);
    }
  }

  private async scanEventEntries(eventMarkets: GammaMarket[][]): Promise<void> {
    if (this.getPositionCount() >= this.cfg.maxPositions) return;

    for (const markets of eventMarkets) {
      if (this.getPositionCount() >= this.cfg.maxPositions) break;

      const eligible = markets.filter(m =>
        m.yesTokenId && !m.closed && !m.resolved && (m.volume ?? 0) >= this.cfg.minVolume,
      );
      if (eligible.length < this.cfg.minMarketsPerEvent) continue;

      const marketPrices = new Map<string, { market: GammaMarket; mid: number; bid: number; ask: number }>();

      for (const market of eligible) {
        try {
          const book = await this.deps.clob.getOrderBook(market.yesTokenId!);
          const ba = this.bestBidAsk(book);
          if (ba.mid <= 0 || ba.mid >= 1) continue;
          this.recordPrice(market.yesTokenId!, ba.mid);
          marketPrices.set(market.yesTokenId!, { market, ...ba });
        } catch { continue; }
      }

      const tokenIds = Array.from(marketPrices.keys());
      for (let i = 0; i < tokenIds.length; i++) {
        if (this.getPositionCount() >= this.cfg.maxPositions) break;
        for (let j = 0; j < tokenIds.length; j++) {
          if (i === j || this.getPositionCount() >= this.cfg.maxPositions) break;

          const leaderTokenId = tokenIds[i];
          const followerTokenId = tokenIds[j];
          const leaderPrices = this.priceHistory.get(leaderTokenId) ?? [];
          const followerPrices = this.priceHistory.get(followerTokenId) ?? [];

          if (leaderPrices.length < this.cfg.maxLag + 2) continue;
          if (followerPrices.length < this.cfg.maxLag + 2) continue;

          const { lag, correlation } = findBestLag(leaderPrices, followerPrices, this.cfg.maxLag);
          if (lag === 0 || Math.abs(correlation) < this.cfg.minCorrelation) continue;

          const predicted = predictMove(leaderPrices, lag);
          if (Math.abs(predicted) < this.cfg.predictionThreshold) continue;

          if (this.hasPosition(marketPrices.get(followerTokenId)!.market.conditionId)) continue;
          if (this.isOnCooldown(marketPrices.get(followerTokenId)!.market.conditionId)) continue;

          const followerInfo = marketPrices.get(followerTokenId)!;
          const effectiveMove = correlation > 0 ? predicted : -predicted;
          const side: 'yes' | 'no' = effectiveMove > 0 ? 'yes' : 'no';
          const tokenId = side === 'yes'
            ? followerTokenId
            : (followerInfo.market.noTokenId ?? followerTokenId);
          const entryPrice = side === 'yes' ? followerInfo.ask : (1 - followerInfo.bid);

          try {
            await this.enterPosition(tokenId, followerInfo.market.conditionId, side, entryPrice,
              parseFloat(this.cfg.positionSize));

            logger.debug('Cross-correlation entry', this.strategyName, {
              leaderTokenId, followerTokenId, lag,
              correlation: correlation.toFixed(4),
              predictedMove: predicted.toFixed(4),
            });
          } catch (err) {
            logger.debug('Entry order failed', this.strategyName, {
              followerTokenId, err: String(err),
            });
          }
        }
      }
    }
  }

  /** Override execute() — this strategy uses getEvents() for cross-correlation across event markets. */
  async execute(): Promise<void> {
    try {
      await this.checkExits();
      const events = await this.deps.gamma.getEvents(15);
      const eventMarkets: GammaMarket[][] = events
        .map(e => e.markets)
        .filter(m => m.length >= this.cfg.minMarketsPerEvent);
      await this.scanEventEntries(eventMarkets);
      logger.debug('Tick complete', this.strategyName, {
        openPositions: this.positions.length,
      });
    } catch (err) {
      logger.error('Tick failed', this.strategyName, { err: String(err) });
    }
  }
}

// ── Legacy factory (backward compat) ─────────────────────────────────────────

export interface CrossCorrelationLagDeps extends StrategyDeps {
  config?: Partial<CrossCorrelationLagConfig>;
}

export function createCrossCorrelationLagTick(deps: CrossCorrelationLagDeps): () => Promise<void> {
  const { config, ...baseDeps } = deps;
  const strategy = new CrossCorrelationLagStrategy(baseDeps, config);
  return strategy.toTickFn();
}
