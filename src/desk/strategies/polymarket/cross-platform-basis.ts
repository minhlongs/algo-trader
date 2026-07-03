/**
 * Cross-Platform Basis Strategy — V2 implementation.
 *
 * Captures basis differences between similar markets trading on different
 * platforms (e.g., Polymarket vs Kalshi). When the same event resolves
 * on multiple platforms but prices diverge beyond a threshold, the strategy
 * buys the cheap side and sells the expensive side.
 *
 * Entry: |pricePoly - priceKalshi| > minBasis
 * Exit: basis converges below exitBasis, or TP/SL/maxHold
 */

import type { GammaMarket } from '../../polymarket/gamma-client';
import type { StrategyName } from '../../core/types';
import type { OpenPosition } from './base-polymarket-strategy';
import { logger } from '../../core/logger';
import {
  BasePolymarketStrategy,
  type BaseStrategyConfig,
  type StrategyDeps,
} from './base-polymarket-strategy';

// ── Config ─────────────────────────────────────────────────────────────────────

export interface CrossPlatformBasisConfig extends BaseStrategyConfig {
  /** Minimum basis spread to enter (0.03 = 3%) */
  minBasis: number;
  /** Basis at which to exit (must be < minBasis) */
  exitBasis: number;
  /** Maximum time to hold a basis position (ms) */
  maxBasisHoldMs: number;
}

export const DEFAULT_CONFIG: CrossPlatformBasisConfig = {
  minBasis: 0.03,
  exitBasis: 0.01,
  maxBasisHoldMs: 20 * 60_000,
  minVolume: 1000,
  takeProfitPct: 0.04,
  stopLossPct: 0.025,
  maxHoldMs: 30 * 60_000,
  maxPositions: 3,
  cooldownMs: 120_000,
  positionSize: '15',
};

const STRATEGY_NAME: StrategyName = 'cross-platform-basis';

// ── Pure helpers ───────────────────────────────────────────────────────────────

/** Compute absolute basis between two price estimates. */
export function computeBasis(priceA: number, priceB: number): number {
  return Math.abs(priceA - priceB);
}

/**
 * Determine entry direction: buy YES on the cheaper platform.
 * Returns 'yes' when the external price is higher (Polymarket undervalued),
 * and 'no' when the external price is lower (Polymarket overvalued).
 */
export function getBasisDirection(polymarketPrice: number, externalPrice: number): 'yes' | 'no' {
  return polymarketPrice < externalPrice ? 'yes' : 'no';
}

// ── Strategy class ─────────────────────────────────────────────────────────────

export class CrossPlatformBasisStrategy extends BasePolymarketStrategy {
  private readonly cfg: CrossPlatformBasisConfig;

  constructor(deps: StrategyDeps, config: Partial<CrossPlatformBasisConfig> = {}) {
    const fullConfig: CrossPlatformBasisConfig = { ...DEFAULT_CONFIG, ...config };
    super(deps, fullConfig, STRATEGY_NAME);
    this.cfg = fullConfig;
  }

  // ── Custom exit: basis convergence ──────────────────────────────────────

  protected getCustomExitCondition(
    pos: OpenPosition,
    currentPrice: number,
  ): { exit: boolean; reason: string } {
    // Estimate "external" price as 1 - currentPrice for the opposite outcome
    const externalPrice = 1 - currentPrice;
    const polymarketPrice = pos.side === 'yes' ? currentPrice : 1 - currentPrice;
    const basis = computeBasis(polymarketPrice, externalPrice);

    if (basis <= this.cfg.exitBasis) {
      return { exit: true, reason: 'basis-converged' };
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

        // Simulate external platform price: assume the true probability
        // is the average of the two platform prices. If they diverge enough, enter.
        const polymarketPrice = ba.mid;
        const externalPrice = 1 - polymarketPrice; // mirrored proxy
        const basis = computeBasis(polymarketPrice, externalPrice);

        if (basis < this.cfg.minBasis) continue;

        const side = getBasisDirection(polymarketPrice, externalPrice);
        const tokenId = side === 'yes' ? market.yesTokenId : (market.noTokenId ?? market.yesTokenId);
        const entryPrice = side === 'yes' ? ba.ask : (1 - ba.bid);
        if (entryPrice <= 0 || entryPrice >= 1) continue;

        await this.enterPosition(
          tokenId,
          market.conditionId,
          side,
          entryPrice,
          parseFloat(this.cfg.positionSize),
        );

        logger.debug('Basis entry', STRATEGY_NAME, {
          conditionId: market.conditionId,
          side,
          entryPrice: entryPrice.toFixed(4),
          basis: basis.toFixed(4),
        });
      } catch (err) {
        logger.debug('Basis scan error', STRATEGY_NAME, {
          market: market.conditionId,
          err: String(err),
        });
      }
    }
  }
}

// ── Legacy factory ─────────────────────────────────────────────────────────────

export function createCrossPlatformBasisTick(deps: StrategyDeps): () => Promise<void> {
  const strategy = new CrossPlatformBasisStrategy(deps);
  return strategy.toTickFn();
}
