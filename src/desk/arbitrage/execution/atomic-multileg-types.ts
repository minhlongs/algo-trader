/**
 * Types and interfaces for atomic multi-leg arbitrage execution.
 *
 * @module desk/arbitrage/execution/atomic-multileg-types
 */

export type ExecutionState =
  | 'PENDING'
  | 'SUBMITTED'
  | 'FILLED'
  | 'PARTIAL_UNWINDING'
  | 'UNWOUND'
  | 'FAILED';

export interface LegOrderSpec {
  legId: string;
  venue: string;
  symbol: string;
  side: 'buy' | 'sell';
  amount: number;
  price: number;
  type: 'limit' | 'market';
  timeoutMs?: number;
}

export interface LegExecutionRecord {
  legId: string;
  orderId?: string;
  clientOrderId?: string;
  venue: string;
  symbol: string;
  side: 'buy' | 'sell';
  requestedAmount: number;
  filledAmount: number;
  price: number;
  avgFillPrice?: number;
  status: 'pending' | 'submitted' | 'filled' | 'partial' | 'failed' | 'canceled';
  fee?: { amount: number; currency: string };
  latencyMs: number;
  error?: string;
}

export interface MultiLegExecutionPlan {
  executionId: string;
  opportunityId: string;
  legs: LegOrderSpec[];
  executionStrategy?: 'concurrent' | 'staged';
  stagedSequence?: string[];
  maxTotalTimeoutMs?: number;
}

export interface UnwindReport {
  unwindId: string;
  success: boolean;
  unwoundLegs: LegExecutionRecord[];
  unwindCostUsd: number;
  error?: string;
  timestamp: number;
}

export interface MultiLegExecutionReport {
  executionId: string;
  opportunityId: string;
  state: ExecutionState;
  legs: LegExecutionRecord[];
  netRealizedPnlUsd?: number;
  slippageBps?: number;
  latencyMs: number;
  unwindReport?: UnwindReport;
  error?: string;
  timestamp: number;
}

export function calculateMultiLegRealizedPnl(legs: LegExecutionRecord[]): number {
  let buyOut = 0;
  let sellIn = 0;
  for (const leg of legs) {
    const notional = leg.filledAmount * leg.price;
    const fee = leg.fee ? leg.fee.amount : 0;
    if (leg.side === 'buy') {
      buyOut += notional + fee;
    } else {
      sellIn += notional - fee;
    }
  }
  return sellIn - buyOut;
}
