/**
 * Arbitrage Types & Interfaces
 * Combinatorial Negative-Risk & Multi-Leg Arbitrage Engine
 */

export type ArbitrageType =
  | 'OVERPRICED_BASKET'
  | 'UNDERPRICED_BASKET'
  | 'SYNTHETIC_DISCREPANCY';

export interface ArbitrageLeg {
  outcomeIndex: number;
  outcomeSymbol: string;
  action: 'BUY' | 'SELL';
  price: number;
  size: number;
  venue: 'AMM' | 'CLOB';
  venueId?: string;
}

export interface ArbitrageOpportunity {
  id: string;
  marketId: string;
  conditionId: string;
  type: ArbitrageType;
  legs: ArbitrageLeg[];
  grossEdge: number;
  estimatedFeesUsdc: number;
  estimatedGasUsd: number;
  netEdge: number;
  netProfitUsd: number;
  maxExecutableSets: number;
  timestampMs: number;
}

export type BundleExecutionState =
  | 'PENDING'
  | 'SUBMITTED'
  | 'FILLED'
  | 'PARTIAL_UNWINDING'
  | 'UNWOUND'
  | 'FAILED';

export interface ExecutionLeg {
  legIndex: number;
  outcomeIndex?: number;
  action: 'BUY' | 'SELL';
  targetSize: number;
  filledSize: number;
  avgFillPrice: number;
  status: 'FILLED' | 'PARTIAL' | 'FAILED';
}

export interface UnwindResult {
  unwoundSets: number;
  recoveredUsdc: number;
  residualLossUsd: number;
  completed: boolean;
  netResidualPositions?: number[];
  residualDeltaExposure?: number;
  postUnwindLegs?: ExecutionLeg[];
}

export interface BundleExecutionResult {
  bundleId: string;
  opportunityId: string;
  state: BundleExecutionState;
  executedLegs: ExecutionLeg[];
  realizedPnlUsd: number;
  gasUsedUsd: number;
  feesPaidUsd: number;
  unwindResult?: UnwindResult;
  timestampMs: number;
}
