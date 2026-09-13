/**
 * Listing Arbitrage Sniper — Types & Config
 */

import type { StrategyName } from '../../core/types';
import type { BaseStrategyConfig, StrategyDeps } from './base-polymarket-strategy';

export interface ListingArbConfig extends BaseStrategyConfig {
  /** yesPrice + noPrice below this = spread > (1 - spreadThreshold) → entry signal */
  spreadEntryThreshold: number;
  /** yesPrice + noPrice above this = spread converged → exit signal */
  spreadConvergenceThreshold: number;
  /** Max market age (ms) since first observation to consider for entry */
  maxMarketAgeMs: number;
  /** Max 24h volume (USDC) for entry — above this = liquidity already arrived */
  maxVolumeEntry: number;
  /** Min 24h volume (USDC) for exit — liquidity arrival signal */
  minVolumeExit: number;
  /** Min market liquidity (USDC) — skip if below */
  minLiquidity: number;
  /** Max USDC per snipe entry */
  maxSnipeUsd: number;
  /** Cooldown between ANY entry (ms), separate from per-market cooldown */
  globalCooldownMs: number;
}

export const DEFAULT_LISTING_ARB_CONFIG: ListingArbConfig = {
  spreadEntryThreshold: 0.98,
  spreadConvergenceThreshold: 0.99,
  maxMarketAgeMs: 30 * 60 * 1000,
  maxVolumeEntry: 5000,
  minVolumeExit: 25_000,
  minLiquidity: 500,
  maxSnipeUsd: 50,
  globalCooldownMs: 60 * 60 * 1000,
  minVolume: 0,
  takeProfitPct: 0.02,
  stopLossPct: 0.015,
  maxHoldMs: 4 * 60 * 60 * 1000,
  maxPositions: 3,
  cooldownMs: 60 * 60 * 1000,
  positionSize: '50',
};

export const STRATEGY_NAME = 'listing-arbitrage-sniper' as StrategyName;

export interface ListingArbDeps extends StrategyDeps {
  config?: Partial<ListingArbConfig>;
  clock?: () => number;
}
