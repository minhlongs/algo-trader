/**
 * Types and governance thresholds for the 11 Polymarket Quant Alpha KPIs
 * (Architecture Report pp. 60–62).
 */

import type { LiquidityObservation } from '../backtesting/liquidity-regimes';
import type { HistoricalSnapshot } from '../backtesting/types';
import type { ReplayedBookStep } from '../polymarket/l2/l2-replay';
import type {
  DataApiV2TradeRow,
  L2SourceLabel,
  PricesHistoryRow,
} from '../polymarket/l2/l2-source-labels';

export type KpiVerdict = 'GO' | 'NO-GO' | 'NOT ENOUGH DATA';

export type KpiId = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11;

export interface KpiRowResult {
  id: KpiId;
  name: string;
  numericValue: number | null;
  formattedValue: string;
  threshold: string;
  verdict: KpiVerdict;
  reason: string;
}

export const KPI_THRESHOLDS = Object.freeze({
  LOCKED_CAPITAL_OPP_COST_ANNUAL: 0.045,
  MIN_PAPER_SHADOW_DAYS: 21,
  MIN_SIM_DRAWDOWN_DAYS: 90,
  MIN_CLOSED_CYCLES_FOR_PF: 5,
  MIN_MAKER_MARKOUT_SAMPLES: 10,
  MIN_CALIBRATION_FORECASTS: 20,
  GO_SORTINO_MIN: 2.0,
  GO_DEFLATED_SHARPE_MIN: 1.5,
  NOGO_DEFLATED_SHARPE_FLOOR: 1.0,
  GO_MAX_DRAWDOWN_SIM_PCT: 4.0,
  GO_MAX_DRAWDOWN_PILOT_PCT: 2.5,
  NOGO_MAX_DRAWDOWN_PILOT_PCT: 3.0,
  GO_PROFIT_FACTOR_MM: 1.35,
  GO_PROFIT_FACTOR_EVENT: 1.6,
  NOGO_PROFIT_FACTOR_FLOOR: 1.15,
  GO_FILL_DIVERGENCE_MAX_PCT: 20.0,
  GO_BASKET_COMPLETION_MIN_PCT: 92.0,
  NOGO_BASKET_COMPLETION_FLOOR_PCT: 85.0,
  NOGO_POST_ONLY_REJECT_MAX_PCT: 30.0,
  GO_REALIZED_SPREAD_60S_NET_BPS: 15.0,
  NOGO_REALIZED_SPREAD_60S_FLOOR_BPS: 0.0,
  GO_BSS_OOS_MIN: 0.02,
  GO_ECE_MAX: 0.035,
  NOGO_BSS_OOS_FLOOR: 0.0,
  GO_AVG_LOCKUP_MAX_DAYS: 10.0,
  GO_LOCKED_CAPITAL_MAX_PCT: 25.0,
  NOGO_LONG_DATED_LOCKED_MAX_PCT: 40.0,
  COST_LATENCY_STRESS_MULTIPLIER: 1.5,
  SLIPPAGE_SHOCK_PRICE: 0.005,
  MARGIN_DEGRADATION_LIMIT_PCT: 35.0,
  GO_CAPACITY_MIN_PUSD: 25_000,
  NOGO_CAPACITY_FLOOR_PUSD: 3_000,
  GO_CLUSTER_LOSS_MAX_NAV_PCT: 3.0,
  MAX_UNEXPLAINED_TOKEN_DISCREPANCY: 1.0,
});

export interface KpiProvenanceBundle {
  snapshots: readonly HistoricalSnapshot[];
  priceRows: readonly PricesHistoryRow[];
  tradeRows: readonly DataApiV2TradeRow[];
  l2Steps: readonly ReplayedBookStep[];
}

export interface KpiClosedCycle {
  eventClusterId: string;
  netPnlPusd: number;
  feeAndSlippagePusd: number;
  notionalPusd: number;
}

export interface KpiMakerMarkoutSample {
  /** Order polarity on the filled token (`'buy' | 'yes'` = bought token, `'sell' | 'no'` = sold token). */
  side: 'buy' | 'sell' | 'yes' | 'no';
  fillPrice: number;
  midAt5s?: number;
  midAt60s: number;
  midAt300s?: number;
  makerRebateBps: number;
  liquidityRewardBps: number;
}

export interface KpiCalibrationSample {
  modelProb: number;
  marketProb: number;
  outcome: 0 | 1;
}

export interface KpiEvaluationInput {
  provenance: KpiProvenanceBundle;
  performance: {
    initialNavPusd: number;
    equityCurve: ReadonlyArray<{ timestamp: string; equity: number }>;
    closedCycles: readonly KpiClosedCycle[];
    relayerAndApiCostPusd: number;
    lockedCapitalAvgPusd: number;
    observationSpanDays: number;
    paperShadowDays: number;
    mode: 'sim-90d' | 'pilot';
    strategyClass: 'market-making' | 'event';
    nTrials: number;
    periodsPerYear: number;
    liquidity?: readonly LiquidityObservation[];
  };
  execution: {
    simMakerFillRate: number | null;
    liveMakerFillRate: number | null;
    basketAttempts: number;
    completeBaskets: number;
    postOnlySubmitted: number;
    postOnlyRejected: number;
  };
  adverseSelection: {
    markouts: readonly KpiMakerMarkoutSample[];
  };
  calibration: {
    forecasts: readonly KpiCalibrationSample[];
  };
  capital: {
    weightedAvgLockupDays: number | null;
    awaitingResolutionPct: number | null;
    lockedOver30dPct: number | null;
  };
  stress: {
    baselineNetPnlPusd: number | null;
    stressed15xNetPnlPusd: number | null;
    plusHalfCentSlippageNetPnlPusd: number | null;
  };
  capacity: {
    deployableCapacityPusd: number | null;
  };
  tailAndSettlement: {
    eventClusterLossPctNav: readonly number[];
    undetectedGhostFills: number | null;
    maxUnexplainedTokenDiscrepancy: number | null;
    onChainReconciled: boolean;
  };
}

export interface VerifiedProvenanceSummary {
  snapshotCount: number;
  marketTickCount: number;
  pricesHistoryRows: number;
  dataApiV2Trades: number;
  recordedL2Steps: number;
  sourcesSeen: L2SourceLabel[];
}

export interface KpiEvaluationReport {
  generatedAtIso: string;
  provenance: VerifiedProvenanceSummary;
  rows: KpiRowResult[];
}
