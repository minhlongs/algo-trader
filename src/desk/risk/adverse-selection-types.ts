/**
 * Adverse Selection & Toxic Flow Guard Types
 *
 * Contracts for measuring informed flow toxicity and generating
 * dynamic market-making spread widening or quote purge signals.
 *
 * @module desk/risk/adverse-selection-types
 */

export interface AdverseSelectionConfig {
  readonly vpinWarningThreshold: number; // e.g. 0.40 -> start widening spread
  readonly vpinCriticalThreshold: number; // e.g. 0.65 -> purge/cancel quotes
  readonly maxSpreadMultiplier: number; // maximum factor to widen spread (e.g. 3.0)
  readonly sensitivityFactor: number; // kappa multiplier for excess VPIN
}

export interface ToxicFlowAssessment {
  readonly marketId: string;
  readonly vpin: number;
  readonly ofi: number;
  readonly spreadMultiplier: number;
  readonly shouldCancelQuotes: boolean;
  readonly state: 'NORMAL' | 'ELEVATED' | 'TOXIC';
  readonly timestamp: number;
}
