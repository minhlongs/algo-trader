/**
 * Shared types for the 11-KPI Investment Committee Scorecard.
 */

export type ICKpiStatus = 'PASS' | 'FAIL' | 'UNKNOWN_INSUFFICIENT_EMPIRICAL_SAMPLE';

export interface ICKpiMetricResult {
  id: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11;
  name: string;
  status: ICKpiStatus;
  label: string;
  observed: string;
  threshold: string;
  detail: string;
}

export type FinalVerdictKey =
  | 'ARCHITECTURE_PARITY'
  | 'L2_CAPTURE_READINESS'
  | '30_DAY_L2_DATA'
  | 'MAKER_ALPHA'
  | 'NEGRISK_ALPHA'
  | 'MARKET_BLIND_ALPHA'
  | 'ECONOMIC_G11'
  | 'LEGAL_G12'
  | 'FOUNDER_G13'
  | 'REAL_MONEY_TRADING';

export type FinalVerdictValue = 'PASS' | 'FAIL' | 'INSUFFICIENT_DATA' | 'GO' | 'HOLD' | 'DISABLED' | 'ENABLED';

export interface ICEmpiricalSamples {
  recordedL2Days: number;
  qualifyingMakerFills: number;
  resolvedOosForecasts: number;
}

export interface ICScorecardInput {
  generatedAtIso?: string;
  mode: 'sim' | 'pilot';
  strategyClass: 'mm' | 'event';
  samples: ICEmpiricalSamples;
  netPnlBootstrapCiLowerPusd?: number;
  /** Optional paper/shadow observation days (must be >= 21 when supplied). */
  paperShadowDays?: number;
  /** Optional total Net PnL & largest single event cluster Net PnL for 1-event concentration check. */
  totalNetPnlPusd?: number;
  maxSingleClusterNetPnlPusd?: number;
  sortinoRatio?: number;
  /** Annualized deflated Sharpe (>= 1.5) OR pass `deflatedSharpeProbability` (>= 0.95) when `deflatedSharpe` is omitted. */
  deflatedSharpe?: number;
  deflatedSharpeProbability?: number;
  maxDrawdownMtmPct?: number;
  profitFactor?: number;
  fillRateDivergencePct?: number;
  multiLegCompletionPct?: number;
  /** Optional post-only rejection percentage (NO-GO if > 30%). */
  postOnlyRejectedPct?: number;
  /** Optional cancel-confirmation latency p99 in ms (GO requires < 250 ms). */
  cancelLatencyP99Ms?: number;
  realizedSpread60sPlusRebateRewardBps?: number;
  bssOos?: number;
  ece?: number;
  weightedAvgLockupDays?: number;
  lockedCapitalPct?: number;
  /** Optional share of capital locked in markets > 30 days to expiry (NO-GO if > 40%). */
  lockedOver30dPct?: number;
  stress15xSlippageNetPnlPusd?: number;
  stress15xCancelLatencyNetPnlPusd?: number;
  stressMinus50PctRewardsNetPnlPusd?: number;
  /** Optional Net PnL under +0.5 tick (0.5c) adverse slippage shock (NO-GO if <= 0). */
  stressPlusHalfTickNetPnlPusd?: number;
  deployableCapacityPusd?: number;
  clusterWorstCaseLossNavPct?: number;
  ghostFillCount?: number;
  maxTokenDrift?: number;
  architectureParityPassed?: boolean;
  l2CaptureReady?: boolean;
  legalG12Approved?: boolean;
  founderG13Approved?: boolean;
}

export interface ICScorecardReport {
  generatedAtIso: string;
  empiricalSampleGatePassed: boolean;
  samples: ICEmpiricalSamples;
  kpis: ICKpiMetricResult[];
  verdicts: Record<FinalVerdictKey, FinalVerdictValue>;
}
