/**
 * Binary Arbitrage Helpers
 * Extracted types, default config, leg simulation, settlement profit, and result builders.
 */

import type { BinaryArbitrageOpportunity, ExecutionResult, ExecutedLeg } from './types';

/** Configuration for binary arbitrage execution */
export interface BinaryExecutorConfig {
  /** Maximum USD position size per trade */
  maxPositionSize: number;
  /** Kelly fraction — use 0.25 to 0.50 for safety (default 0.25) */
  kellyFraction: number;
  /** Maximum allowed drawdown as fraction of bankroll before halting (default 0.20) */
  maxDrawdownPct: number;
  /** If true, log actions but do not place real orders (default true) */
  dryRun: boolean;
}

export const DEFAULT_BINARY_EXECUTOR_CONFIG: BinaryExecutorConfig = {
  maxPositionSize: 1000,
  kellyFraction: 0.25,
  maxDrawdownPct: 0.20,
  dryRun: true,
};

/** Internal execution log entry for audit trail */
export interface ExecutionLogEntry {
  opportunityId: string;
  timestamp: number;
  positionSize: number;
  dryRun: boolean;
  result: 'executed' | 'skipped' | 'failed';
  reason?: string;
}

export function buildBinaryExecutedLegs(
  opp: BinaryArbitrageOpportunity,
  positionSize: number,
  withTxHash = false,
): ExecutedLeg[] {
  return opp.legs.map((leg) => ({
    exchange: leg.exchange,
    symbol: leg.symbol,
    side: leg.side,
    executedPrice: leg.price,
    executedAmount: positionSize / opp.legs.length,
    fee: leg.fee * (positionSize / opp.legs.length),
    ...(withTxHash ? { txHash: `0x${Math.random().toString(16).slice(2)}` } : {}),
  }));
}

export function calculateBinarySettlementProfit(legs: ExecutedLeg[]): number {
  const totalSpent = legs.reduce((s, l) => s + l.executedPrice * l.executedAmount + l.fee, 0);
  const settlement = legs.reduce((s, l) => s + l.executedAmount, 0);
  return settlement - totalSpent;
}

export function buildBinaryExecutionResult(
  opp: BinaryArbitrageOpportunity,
  success: boolean,
  legs: ExecutedLeg[],
  profit: number,
  error?: string,
): ExecutionResult {
  const totalFees = legs.reduce((s, l) => s + l.fee, 0);
  const stake = legs.reduce((s, l) => s + l.executedAmount, 0) || 1;
  return {
    opportunityId: opp.id,
    success,
    executedLegs: legs,
    actualProfit: profit,
    actualProfitPct: (profit / stake) * 100,
    totalFees,
    error,
    executedAt: Date.now(),
  };
}
