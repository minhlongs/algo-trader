/**
 * Pairs Statistical Arbitrage Strategy — V2 implementation.
 *
 * Trades pairs of related Polymarket markets from the same event group.
 * Computes the spread (price difference) between two markets, applies
 * Bollinger bands to the spread, and enters when the spread exceeds
 * the outer band — betting on mean reversion.
 */

import type { GammaMarket } from '../../polymarket/gamma-client';
import type { StrategyName } from '../../core/types';
import { logger } from '../../core/logger';
import {
  BasePolymarketStrategy,
  type BaseStrategyConfig,
  type StrategyDeps,
} from './base-polymarket-strategy';
import { calcSMA, calcStdDev } from './strategy-math-helpers';

// ── Config ───────────────────────────────────────────────────────────────────

export interface PairsStatArbConfig extends BaseStrategyConfig {
  /** Rolling window for spread mean/std computation */
  windowSize: number;
  /** Bollinger band width in standard deviations */
  bandWidth: number;
  /** Minimum spread Z-score to trigger entry */
  entryZScore: number;
  /** Maximum spread Z-score — beyond this is regime change, not mean reversion */
  maxZScore: number;
  /** Minimum correlation between pair members to qualify */
  minCorrelation: number;
  /** Minimum market volume */
  minVolume: number;
  /** Base position size per leg */
  baseSizeUsdc: number;
  /** Number of events to scan */
  scanLimit: number;
}

export const DEFAULT_CONFIG: PairsStatArbConfig = {
  windowSize: 20,
  bandWidth: 2.0,
  entryZScore: 2.0,
  maxZScore: 4.0,
  minCorrelation: 0.6,
  minVolume: 500,
  baseSizeUsdc: 20,
  scanLimit: 5,
  takeProfitPct: 0.03,
  stopLossPct: 0.02,
  maxHoldMs: 8 * 60_000,
  maxPositions: 2,
  cooldownMs: 120_000,
  positionSize: '20',
};

const STRATEGY_NAME: StrategyName = 'pairs-stat-arb';

// ── Pure helpers ─────────────────────────────────────────────────────────────

/**
 * Spread between two markets: priceA - priceB.
 * For binary options on the same event, spread = P(event A) - P(event B).
 */
export function calcSpread(priceA: number, priceB: number): number {
  return priceA - priceB;
}

/**
 * Compute Bollinger upper and lower bands for a spread series.
 */
export function calcBollingerBands(spreads: number[], bandWidth: number): {
  mean: number; std: number; upper: number; lower: number;
} {
  if (spreads.length < 3) return { mean: 0, std: 0, upper: 0, lower: 0 };
  const mean = calcSMA(spreads);
  const std = calcStdDev(spreads);
  return { mean, std, upper: mean + bandWidth * std, lower: mean - bandWidth * std };
}

/**
 * Z-score of current spread relative to rolling distribution.
 */
export function calcSpreadZScore(current: number, spreads: number[]): number {
  if (spreads.length < 3) return 0;
  const mean = calcSMA(spreads);
  const std = calcStdDev(spreads);
  if (std <= 0) return 0;
  return (current - mean) / std;
}

/**
 * Pearson correlation between two price arrays (uses same-period returns).
 */
export function calcPairCorr(pricesA: number[], pricesB: number[]): number {
  const n = Math.min(pricesA.length, pricesB.length);
  if (n < 5) return 0;
  const retA: number[] = [];
  const retB: number[] = [];
  for (let i = 1; i < n; i++) {
    if (pricesA[i - 1]! > 0 && pricesB[i - 1]! > 0) {
      retA.push((pricesA[i]! - pricesA[i - 1]!) / pricesA[i - 1]!);
      retB.push((pricesB[i]! - pricesB[i - 1]!) / pricesB[i - 1]!);
    }
  }
  if (retA.length < 5) return 0;
  const meanA = retA.reduce((s, v) => s + v, 0) / retA.length;
  const meanB = retB.reduce((s, v) => s + v, 0) / retB.length;
  let num = 0, denA = 0, denB = 0;
  for (let i = 0; i < retA.length; i++) {
    const da = retA[i]! - meanA;
    const db = retB[i]! - meanB;
    num += da * db;
    denA += da * da;
    denB += db * db;
  }
  const denom = Math.sqrt(denA * denB);
  return denom === 0 ? 0 : Math.max(-1, Math.min(1, num / denom));
}

// ── Strategy class ───────────────────────────────────────────────────────────

export class PairsStatArbStrategy extends BasePolymarketStrategy {
  private readonly cfg: PairsStatArbConfig;
  private readonly priceHistory = new Map<string, number[]>();
  private readonly pairStatus = new Map<string, 'long' | 'short'>();

  constructor(deps: StrategyDeps, config: Partial<PairsStatArbConfig> = {}) {
    const fullConfig = { ...DEFAULT_CONFIG, ...config };
    super(deps, fullConfig, STRATEGY_NAME);
    this.cfg = fullConfig;
  }

  private recordPrice(tokenId: string, price: number): void {
    let h = this.priceHistory.get(tokenId);
    if (!h) { h = []; this.priceHistory.set(tokenId, h); }
    h.push(price);
    if (h.length > this.cfg.windowSize * 4) h.splice(0, h.length - this.cfg.windowSize * 4);
  }

  private async scanPair(marketA: GammaMarket, marketB: GammaMarket): Promise<void> {
    if (!marketA.yesTokenId || !marketB.yesTokenId) return;
    if (marketA.closed || marketA.resolved || marketB.closed || marketB.resolved) return;
    if (this.getPositionCount() >= this.cfg.maxPositions) return;

    try {
      const bookA = await this.deps.clob.getOrderBook(marketA.yesTokenId);
      const bookB = await this.deps.clob.getOrderBook(marketB.yesTokenId);
      const baA = this.bestBidAsk(bookA);
      const baB = this.bestBidAsk(bookB);

      this.recordPrice(marketA.yesTokenId, baA.mid);
      this.recordPrice(marketB.yesTokenId, baB.mid);

      const pricesA = this.priceHistory.get(marketA.yesTokenId) ?? [];
      const pricesB = this.priceHistory.get(marketB.yesTokenId) ?? [];

      if (pricesA.length < this.cfg.windowSize || pricesB.length < this.cfg.windowSize) return;

      // Verify pair correlation
      const corr = calcPairCorr(pricesA, pricesB);
      if (corr < this.cfg.minCorrelation) return;

      // Compute spread Bollinger bands
      const spreads: number[] = [];
      const recent = Math.min(pricesA.length, pricesB.length);
      for (let i = 0; i < recent; i++) {
        spreads.push(calcSpread(pricesA[i]!, pricesB[i]!));
      }

      const currentSpread = calcSpread(baA.mid, baB.mid);
      const bands = calcBollingerBands(spreads, this.cfg.bandWidth);
      const zScore = calcSpreadZScore(currentSpread, spreads);

      if (Math.abs(zScore) > this.cfg.maxZScore) {
        logger.debug('Spread extreme — regime change likely', STRATEGY_NAME, {
          pair: `${marketA.conditionId}:${marketB.conditionId}`, zScore: zScore.toFixed(2),
        });
        return;
      }

      const pairKey = `${marketA.conditionId}:${marketB.conditionId}`;
      const currentSide = this.pairStatus.get(pairKey);

      if (zScore > this.cfg.entryZScore && currentSide !== 'short') {
        // Spread is wide: marketA overpriced relative to marketB
        // Bet on convergence: buy B (cheaper), avoid A
        if (!this.hasPosition(marketB.conditionId) && !this.isOnCooldown(marketB.conditionId)) {
          await this.enterPosition(marketB.yesTokenId, marketB.conditionId, 'yes', baB.ask, this.cfg.baseSizeUsdc);
          this.pairStatus.set(pairKey, 'short');
          logger.debug('Pairs arb entry (short spread)', STRATEGY_NAME, {
            pair: pairKey, zScore: zScore.toFixed(2), spread: currentSpread.toFixed(4),
            side: 'yes', market: marketB.conditionId,
          });
        }
      } else if (zScore < -this.cfg.entryZScore && currentSide !== 'long') {
        // Spread is narrow: marketB overpriced relative to marketA
        if (!this.hasPosition(marketA.conditionId) && !this.isOnCooldown(marketA.conditionId)) {
          await this.enterPosition(marketA.yesTokenId, marketA.conditionId, 'yes', baA.ask, this.cfg.baseSizeUsdc);
          this.pairStatus.set(pairKey, 'long');
          logger.debug('Pairs arb entry (long spread)', STRATEGY_NAME, {
            pair: pairKey, zScore: zScore.toFixed(2), spread: currentSpread.toFixed(4),
            side: 'yes', market: marketA.conditionId,
          });
        }
      }
    } catch (err) {
      logger.debug('Pair scan error', STRATEGY_NAME, { pair: `${marketA.conditionId}:${marketB.conditionId}`, err: String(err) });
    }
  }

  protected async scanEntries(_markets: GammaMarket[]): Promise<void> {
    if (this.getPositionCount() >= this.cfg.maxPositions) return;

    try {
      const events = await this.deps.gamma.getEvents(this.cfg.scanLimit);
      for (const event of events) {
        const active = event.markets.filter(m => !m.closed && !m.resolved);
        if (active.length < 2) continue;

        for (let i = 0; i < active.length - 1; i++) {
          for (let j = i + 1; j < active.length; j++) {
            await this.scanPair(active[i]!, active[j]!);
          }
        }
      }
    } catch (err) {
      logger.debug('Events fetch error', STRATEGY_NAME, { err: String(err) });
    }
  }

  async execute(): Promise<void> {
    try {
      await this.checkExits();
      const markets = await this.deps.gamma.getTrending(30);
      await this.scanEntries(markets);
      logger.debug('Tick complete', STRATEGY_NAME, {
        openPositions: this.positions.length,
        trackedPairs: this.pairStatus.size,
      });
    } catch (err) {
      logger.error('Tick failed', STRATEGY_NAME, { err: String(err) });
    }
  }
}

// ── Legacy factory ───────────────────────────────────────────────────────────

export function createPairsStatArbTick(deps: StrategyDeps): () => Promise<void> {
  const strategy = new PairsStatArbStrategy(deps);
  return strategy.toTickFn();
}
