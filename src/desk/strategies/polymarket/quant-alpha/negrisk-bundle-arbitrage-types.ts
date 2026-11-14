/**
 * Event-level NegRisk bundle arbitrage — parameter surface (report: "Strategy 2").
 *
 * An event is *exhaustive* when exactly one of its N outcomes resolves YES.
 * Buying YES on all N then redeems exactly 1.00 pUSD, so the bundle is an
 * arbitrage whenever the asks sum below 1.00 after fees. Every number the
 * report pins (capital envelope, solver budget, failfast tolerance) lives here
 * as a field so a backtest can sweep it.
 *
 * `BaseStrategyConfig` fields stay last so a caller overrides them unchanged.
 */

import type { StrategyName } from '../../../core/types';
import type { BaseStrategyConfig } from '../base-polymarket-strategy';

/** Where a leg is written relative to the visible touch. */
export type BundleLegPlacement = 'touch' | 'one-tick-inside';

export interface NegRiskBundleConfig extends BaseStrategyConfig {
  /** Smallest outcome count the report will bundle (report: 4–12). */
  minEventOutcomeCount: number;
  /** Largest outcome count the report will bundle. */
  maxEventOutcomeCount: number;
  /** Bundle must cost strictly under this many pUSD per share. */
  maxBundleCostPusd: number;
  /** Minimum net edge per share after taker fees and the vault fee. */
  minEdgePusd: number;
  /** Notional per leg per share lot. */
  legNotionalPusd: number;
  /** Capital the report allocates to one event cluster, lower bound. */
  minCapitalPerEventPusd: number;
  /** Capital the report allocates to one event cluster, upper bound. */
  maxCapitalPerEventPusd: number;
  /** A leg is "thin" when the displayed size at its ask is below this. */
  thinLegMaxDisplayedShares: number;
  /** Order type for post-only thin legs — maker legs pay no taker fee. */
  thinLegOrderType: 'GTC' | 'GTD';
  /** Order type for the aggressively matched thick legs. */
  thickLegOrderType: 'IOC' | 'FOK';
  /** Abort the remaining legs as soon as one thick leg fails. */
  sequentialFailfast: boolean;
  /** Failfast error fraction above which the whole event cluster is killed. */
  maxFailfastErrorRate: number;
  /** Later legs are shrunk to this fraction of the first leg's actual fill. */
  shrinkToFirstFillRatio: number;
  /** Wall-clock budget for one projection; a slower result is discarded. */
  solverTimeBudgetMs: number;
  /** Iteration cap for the projection solver. */
  solverMaxIterations: number;
  /** Duality-gap tolerance that counts as converged. */
  solverTolerance: number;
  /** Discard a projection that did not converge (report: true). */
  fwRequireConverged: boolean;
  /** Lower bound of the fee-coefficient band where maker-ratio optimisation applies. */
  makerOptimisedFeeRateMin: number;
  /** Upper bound of that band (report: 0.04–0.059). */
  makerOptimisedFeeRateMax: number;
  /** Vault fee charged per converted share, in pUSD. */
  conversionVaultFeePusd: number;
  /** Real-profit error the report accepts against live conversion (report: 15 bps). */
  realProfitToleranceBps: number;
  /** Kill the event as soon as its outcome list grows (augmented neg-risk). */
  killOnAugmentedNegRisk: boolean;
  /** How many events one scan asks Gamma for. */
  eventScanLimit: number;
  /** Market price tick. No desk-layer API exposes it, so it is parameterised. */
  tickSize: number;
  /** Placement of a leg relative to the visible touch. */
  legPlacement: BundleLegPlacement;
}

export const DEFAULT_CONFIG: NegRiskBundleConfig = {
  minEventOutcomeCount: 4,
  maxEventOutcomeCount: 12,
  maxBundleCostPusd: 0.99,
  minEdgePusd: 0.005,
  legNotionalPusd: 500,
  minCapitalPerEventPusd: 5_000,
  maxCapitalPerEventPusd: 25_000,
  thinLegMaxDisplayedShares: 200,
  thinLegOrderType: 'GTC',
  thickLegOrderType: 'IOC',
  sequentialFailfast: true,
  maxFailfastErrorRate: 0.15,
  shrinkToFirstFillRatio: 1,
  solverTimeBudgetMs: 25,
  solverMaxIterations: 200,
  solverTolerance: 1e-9,
  fwRequireConverged: true,
  makerOptimisedFeeRateMin: 0.04,
  makerOptimisedFeeRateMax: 0.059,
  conversionVaultFeePusd: 0,
  realProfitToleranceBps: 15,
  killOnAugmentedNegRisk: true,
  eventScanLimit: 30,
  tickSize: 0.01,
  legPlacement: 'touch',
  minVolume: 1000,
  takeProfitPct: 0.02,
  stopLossPct: 0.015,
  maxHoldMs: 6 * 60 * 60_000,
  maxPositions: 3,
  cooldownMs: 120_000,
  positionSize: '500',
};

export const STRATEGY_NAME: StrategyName = 'negrisk-bundle-arbitrage';

/** One outcome of the event, priced from its own real ask book. */
export interface BundleLeg {
  tokenId: string;
  conditionId: string;
  outcome: string;
  /** Best ask, snapped to the tick. 0 when the side is empty. */
  askPrice: number;
  /** Size resting exactly at `askPrice` — the only size we can cross. */
  displayedShares: number;
}

/** A whole event priced as one buy-N-of-N bundle. */
export interface BundleQuote {
  eventId: string;
  eventTitle: string;
  legs: BundleLeg[];
  /** Sum of the leg ask prices. */
  totalCostPusd: number;
  /** Taker fees summed across legs that will match aggressively. */
  takerFeePusd: number;
  /** 1.00 − cost − taker fees − vault fee. */
  netEdgePusd: number;
  /** True when the market charges inside the report's maker-optimisation band. */
  makerOptimisationApplies: boolean;
}

/** The projection result the scan path reads. */
export interface BundleProjection {
  probabilities: number[];
  converged: boolean;
  iterations: number;
  elapsedMs: number;
}
