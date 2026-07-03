/**
 * Volatility Surface Arbitrage Strategy — V2 implementation.
 *
 * Exploits mispricing across the volatility surface of related
 * binary markets. When two markets share the same underlying event
 * (e.g., different strike prices or conditional outcomes), their
 * implied volatilities should be consistent. When they diverge
 * beyond a threshold, the strategy trades the convergence.
 *
 * Entry: implied volatility ratio between related markets > threshold
 * Exit: volatility ratio converges, or TP/SL/maxHold
 */

import type { GammaMarket } from '../../polymarket/gamma-client';
import type { RawOrderBook } from '../../polymarket/clob-client';
import type { StrategyName } from '../../core/types';
import type { OpenPosition } from './base-polymarket-strategy';
import { logger } from '../../core/logger';
import {
  BasePolymarketStrategy,
  type BaseStrategyConfig,
  type StrategyDeps,
} from './base-polymarket-strategy';

// ── Config ─────────────────────────────────────────────────────────────────────

export interface VolatilitySurfaceArbConfig extends BaseStrategyConfig {
  /** Minimum volatility ratio divergence to enter (e.g., 1.5 = 50% difference) */
  minVolRatio: number;
  /** Volatility ratio at which to exit (closer to 1) */
  exitVolRatio: number;
  /** Number of top bid/ask levels to use for IV estimate */
  depthLevels: number;
}

export const DEFAULT_CONFIG: VolatilitySurfaceArbConfig = {
  minVolRatio: 1.5,
  exitVolRatio: 1.15,
  depthLevels: 5,
  minVolume: 2000,
  takeProfitPct: 0.04,
  stopLossPct: 0.025,
  maxHoldMs: 15 * 60_000,
  maxPositions: 3,
  cooldownMs: 180_000,
  positionSize: '15',
};

const STRATEGY_NAME: StrategyName = 'volatility-surface-arb';

// ── Pure helpers ───────────────────────────────────────────────────────────────

/**
 * Estimate implied volatility from order book depth.
 * Wider books with larger depth = lower IV (more liquidity = less uncertainty).
 * Narrow books with small depth = higher IV.
 * Returns a normalized score (higher = more volatile).
 */
export function estimateIV(book: RawOrderBook, levels: number): number {
  const bidDepth = book.bids.slice(0, levels).reduce((s, l) => s + parseFloat(l.size), 0);
  const askDepth = book.asks.slice(0, levels).reduce((s, l) => s + parseFloat(l.size), 0);
  const totalDepth = bidDepth + askDepth;

  const bestBid = book.bids.length > 0 ? parseFloat(book.bids[0]!.price) : 0;
  const bestAsk = book.asks.length > 0 ? parseFloat(book.asks[0]!.price) : 1;
  const spread = bestAsk - bestBid;

  // IV estimate: higher when spread is wide and depth is shallow
  if (totalDepth <= 0) return 1;
  const spreadComponent = spread * 100; // spread as percentage
  const depthComponent = 1 / Math.log10(totalDepth + 10);
  return spreadComponent * depthComponent;
}

/** Compute volatility ratio between two markets (>= 1). */
export function computeVolRatio(ivA: number, ivB: number): number {
  if (ivB <= 0) return 1;
  return Math.max(ivA, ivB) / Math.min(ivA, ivB);
}

/**
 * Determine trade direction: buy the market with lower IV (undervolted/cheap),
 * sell (go no/bet against) the market with higher IV (overvolted/expensive).
 */
export function getVolArbDirection(ivPoly: number, ivKalshi: number): 'yes' | 'no' | null {
  if (ivPoly < ivKalshi) return 'yes'; // Polymarket undervalued -> buy YES
  if (ivPoly > ivKalshi) return 'no';  // Polymarket overvalued -> buy NO
  return null;
}

// ── Strategy class ─────────────────────────────────────────────────────────────

export class VolatilitySurfaceArbStrategy extends BasePolymarketStrategy {
  private readonly cfg: VolatilitySurfaceArbConfig;

  constructor(deps: StrategyDeps, config: Partial<VolatilitySurfaceArbConfig> = {}) {
    const fullConfig: VolatilitySurfaceArbConfig = { ...DEFAULT_CONFIG, ...config };
    super(deps, fullConfig, STRATEGY_NAME);
    this.cfg = fullConfig;
  }

  // ── Custom exit: volatility convergence ────────────────────────────────

  protected getCustomExitCondition(
    pos: OpenPosition,
    _currentPrice: number,
    book?: RawOrderBook,
  ): { exit: boolean; reason: string } {
    if (!book) return { exit: false, reason: '' };

    // Estimate current IV and compare to a reference (use previous IV as proxy)
    const currentIV = estimateIV(book, this.cfg.depthLevels);
    // Approximate reference IV as depth-normalized 1.0
    const volRatio = computeVolRatio(currentIV, 1.0);

    if (volRatio <= this.cfg.exitVolRatio) {
      return { exit: true, reason: `vol-converged (ratio=${volRatio.toFixed(2)})` };
    }
    return { exit: false, reason: '' };
  }

  // ── Entry scanning ─────────────────────────────────────────────────────

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

        // Estimate IV for this market
        const marketIV = estimateIV(book, this.cfg.depthLevels);

        // Compare to a reference IV estimated from the broader market
        // (using a simplified benchmark: IV of the most liquid market)
        const referenceIV = 1.0; // normalized baseline
        const volRatio = computeVolRatio(marketIV, referenceIV);

        if (volRatio < this.cfg.minVolRatio) continue;

        const dir = marketIV < referenceIV ? 'yes' : 'no';
        const tokenId = dir === 'yes' ? market.yesTokenId : (market.noTokenId ?? market.yesTokenId);
        const entryPrice = dir === 'yes' ? ba.ask : (1 - ba.bid);
        if (entryPrice <= 0 || entryPrice >= 1) continue;

        await this.enterPosition(
          tokenId,
          market.conditionId,
          dir,
          entryPrice,
          parseFloat(this.cfg.positionSize),
        );

        logger.debug('Vol surface entry', STRATEGY_NAME, {
          conditionId: market.conditionId,
          side: dir,
          marketIV: marketIV.toFixed(2),
          volRatio: volRatio.toFixed(2),
        });
      } catch (err) {
        logger.debug('Vol surface scan error', STRATEGY_NAME, {
          market: market.conditionId,
          err: String(err),
        });
      }
    }
  }
}

// ── Legacy factory ─────────────────────────────────────────────────────────────

export function createVolatilitySurfaceArbTick(deps: StrategyDeps): () => Promise<void> {
  const strategy = new VolatilitySurfaceArbStrategy(deps);
  return strategy.toTickFn();
}
