/**
 * Execution Slippage Tracker Types
 *
 * Contracts for measuring realized price impact, implementation shortfall,
 * execution latency, and venue fill quality benchmarking.
 *
 * @module desk/execution/execution-slippage-types
 */

export type TradeSide = 'BUY' | 'SELL';
export type SlippageGrade = 'EXCELLENT' | 'GOOD' | 'FAIR' | 'POOR';

export interface OrderExecutionRecord {
  readonly orderId: string;
  readonly marketId: string;
  readonly venue: string;
  readonly side: TradeSide;
  readonly requestedQuantity: number;
  readonly filledQuantity: number;
  readonly arrivalMidPrice: number;
  readonly executedAvgPrice: number;
  readonly feesPaidUsd: number;
  readonly executionLatencyMs: number;
  readonly timestamp: number;
}

export interface SlippageAttribution {
  readonly orderId: string;
  readonly venue: string;
  readonly slippageBps: number; // positive = adverse, negative = price improvement
  readonly slippageCostUsd: number;
  readonly feeFrictionBps: number;
  readonly fillRatioPct: number;
  readonly grade: SlippageGrade;
}

export interface VenueQualityBenchmark {
  readonly venue: string;
  readonly totalOrders: number;
  readonly totalNotionalUsd: number;
  readonly avgSlippageBps: number;
  readonly avgLatencyMs: number;
  readonly avgFillRatioPct: number;
}
