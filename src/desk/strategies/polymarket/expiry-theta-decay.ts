/**
 * Expiry Theta Decay Strategy — V2 implementation.
 *
 * Captures theta decay premium as binary event markets approach their
 * resolution date. As resolution nears, probability uncertainty decreases
 * and the market price converges toward 0 or 1, rewarding positions
 * taken in the direction of the likely outcome.
 *
 * Entry: sell premium (bet on the likely outcome) when the market is
 *   near expiry and the favorite is priced below fair value
 * Exit: theta decay realizes gain, or TP/SL/maxHold
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

export interface ExpiryThetaDecayConfig extends BaseStrategyConfig {
  /** Max hours until event resolution to consider (48 = 2 days) */
  maxHoursToExpiry: number;
  /** Min hours until event resolution to consider */
  minHoursToExpiry: number;
  /** Estimated theta decay per hour as fraction of remaining premium */
  thetaRate: number;
  /** Minimum edge as fraction for entry */
  minEdge: number;
}

export const DEFAULT_CONFIG: ExpiryThetaDecayConfig = {
  maxHoursToExpiry: 48,
  minHoursToExpiry: 2,
  thetaRate: 0.02,
  minEdge: 0.01,
  minVolume: 500,
  takeProfitPct: 0.03,
  stopLossPct: 0.03,
  maxHoldMs: 8 * 60_000,
  maxPositions: 5,
  cooldownMs: 60_000,
  positionSize: '10',
};

const STRATEGY_NAME: StrategyName = 'expiry-theta-decay';

// ── Pure helpers ───────────────────────────────────────────────────────────────

/** Parse ISO endDate and return hours remaining. Returns -1 if expired. */
export function hoursToExpiry(endDate: string): number {
  const now = Date.now();
  const end = new Date(endDate).getTime();
  if (end <= now) return -1;
  return (end - now) / 3_600_000;
}

/** Compute theta decay edge: -1 (bad) to 1 (good). */
export function computeThetaEdge(
  price: number,
  hoursLeft: number,
  thetaRate: number,
): number {
  const decayPotential = (price > 0.5 ? 1 - price : price) * thetaRate * hoursLeft;
  return decayPotential;
}

// ── Strategy class ─────────────────────────────────────────────────────────────

export class ExpiryThetaDecayStrategy extends BasePolymarketStrategy {
  private readonly cfg: ExpiryThetaDecayConfig;

  constructor(deps: StrategyDeps, config: Partial<ExpiryThetaDecayConfig> = {}) {
    const fullConfig: ExpiryThetaDecayConfig = { ...DEFAULT_CONFIG, ...config };
    super(deps, fullConfig, STRATEGY_NAME);
    this.cfg = fullConfig;
  }

  // ── Custom exit: theta fully decayed ───────────────────────────────────

  protected getCustomExitCondition(
    pos: OpenPosition,
    currentPrice: number,
  ): { exit: boolean; reason: string } {
    const effectivePrice = pos.side === 'yes' ? currentPrice : 1 - currentPrice;
    // If the position side is now worth > 0.95, it's fully decayed
    if (effectivePrice >= 0.95) {
      return { exit: true, reason: 'theta-decayed' };
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
        const hrs = hoursToExpiry(market.endDate);
        if (hrs < this.cfg.minHoursToExpiry || hrs > this.cfg.maxHoursToExpiry) continue;

        const book = await this.deps.clob.getOrderBook(market.yesTokenId);
        const ba = this.bestBidAsk(book);
        if (ba.mid <= 0 || ba.mid >= 1) continue;

        // The "favorite" is the side above 0.5. We bet on the favorite
        // capturing theta decay as uncertainty resolves.
        const favSide: 'yes' | 'no' = ba.mid >= 0.5 ? 'yes' : 'no';
        const favPrice = favSide === 'yes' ? ba.mid : 1 - ba.mid;
        const edge = computeThetaEdge(ba.mid, hrs, this.cfg.thetaRate);

        if (edge < this.cfg.minEdge) continue;

        const tokenId = favSide === 'yes' ? market.yesTokenId : (market.noTokenId ?? market.yesTokenId);
        const entryPrice = favSide === 'yes' ? ba.ask : (1 - ba.bid);
        if (entryPrice <= 0 || entryPrice >= 1) continue;

        await this.enterPosition(
          tokenId,
          market.conditionId,
          favSide,
          entryPrice,
          parseFloat(this.cfg.positionSize),
        );

        logger.debug('Theta decay entry', STRATEGY_NAME, {
          conditionId: market.conditionId,
          side: favSide,
          favPrice: favPrice.toFixed(4),
          hoursToExpiry: hrs.toFixed(1),
          edge: edge.toFixed(4),
        });
      } catch (err) {
        logger.debug('Theta scan error', STRATEGY_NAME, {
          market: market.conditionId,
          err: String(err),
        });
      }
    }
  }
}

// ── Legacy factory ─────────────────────────────────────────────────────────────

export function createExpiryThetaDecayTick(deps: StrategyDeps): () => Promise<void> {
  const strategy = new ExpiryThetaDecayStrategy(deps);
  return strategy.toTickFn();
}
