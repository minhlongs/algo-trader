/**
 * Desk Harmonizer Type Contracts
 * Defines pipeline states, flow actions, and telemetry records.
 *
 * @module desk/harmonizer/desk-harmonizer-types
 */

import type { LeadLagAlphaSignal } from '../signal/lead-lag-alpha-types';
import type { VpinToxicityMetrics } from '../risk/vpin-toxic-flow-types';
import type { OptimalQuoteTwoWay } from '../strategies/inventory-skew-types';
import type { BundleFillResult } from '../sor/combinatorial-bundle-types';
import type { LpLvrMetrics } from '../amm/lp-lvr-yield-types';

export type HarmonizerState =
  | 'IDLE'
  | 'EVALUATING_FLOW'
  | 'DEFENSIVE_WIDEN'
  | 'QUOTING_ACTIVE'
  | 'ROUTING_BUNDLE'
  | 'HEDGING_LVR'
  | 'ERROR_FALLBACK';

export interface HarmonizerCycleInput {
  readonly marketId: string;
  readonly leadVenue: string;
  readonly lagVenue: string;
  readonly symbol: string;
  readonly currentMidPrice: number;
  readonly netInventory: number;
  readonly timeToExpirySec: number;
  readonly timestampMs: number;
}

export interface HarmonizedDeskDecision {
  readonly marketId: string;
  readonly state: HarmonizerState;
  readonly alphaSignal?: LeadLagAlphaSignal;
  readonly toxicity?: VpinToxicityMetrics;
  readonly quotes?: OptimalQuoteTwoWay;
  readonly bundleExecution?: BundleFillResult;
  readonly lvrHedgeMetrics?: LpLvrMetrics;
  readonly recommendedDeltaHedgeUnits: number;
  readonly defensiveSpreadMultiplier: number;
  readonly timestampMs: number;
}

export interface DeskHarmonizerConfig {
  readonly toxicVpinThreshold?: number;
  readonly baseRiskAversionGamma?: number;
  readonly maxAbsInventory?: number;
  readonly baseOrderSize?: number;
  readonly maxSkewTolerance?: number;
}
