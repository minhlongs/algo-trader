/**
 * Wave 279 — Bouchaud, Farmer & Lillo (2009): How Markets Slowly Digest Changes in Supply and Demand
 * Types & Configuration Interfaces
 */

export interface BouchaudFarmerLillo2009Config {
  readonly metaorderSizeShares: number;
  readonly dailyVolumeShares: number;
  readonly dailyVolatility: number;
  readonly yConstant: number;
  readonly executionDurationSteps: number;
  readonly postExecutionSteps: number;
  readonly signAutocorrGamma: number;
}

export interface MetaorderDigestPoint {
  readonly step: number;
  readonly phase: 'DURING_METAORDER' | 'POST_METAORDER_RELAXATION';
  readonly expectedImpactPct: number;
}

export interface BouchaudFarmerLillo2009Result {
  readonly peakImpactPct: number;
  readonly permanentPlateauImpactPct: number;
  readonly relaxationRatio: number;
  readonly profile: readonly MetaorderDigestPoint[];
}
