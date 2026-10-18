/**
 * Pure validation, opportunity conversion, and payout calculation helpers
 * for SplitMergeArbitrageExecutor.
 */

import type {
  ArbitrageOpportunity,
  ExecutionResult,
  SplitMergeArbitrageOpportunity,
} from '../types';
import type { SplitMergeOpportunity } from '../split-merge-arb-executor';

export const POLY_FEE = 0.02;

export function hasRequiredSplitMergeFields(
  opportunity: ArbitrageOpportunity,
): opportunity is SplitMergeArbitrageOpportunity {
  const candidate = opportunity as unknown as Record<string, unknown>;
  return (
    typeof candidate.marketId === 'string' &&
    typeof candidate.yesPrice === 'number' &&
    typeof candidate.noPrice === 'number'
  );
}

export function buildSplitMergeOpportunity(
  opportunity: SplitMergeArbitrageOpportunity,
): SplitMergeOpportunity {
  const { yesPrice, noPrice } = opportunity;
  const totalCost = yesPrice + noPrice;
  return {
    marketId: opportunity.id,
    title: opportunity.id,
    yesPrice,
    noPrice,
    totalCost,
    profit: 1.0 - POLY_FEE - totalCost,
    profitPercent: ((1.0 - POLY_FEE - totalCost) / totalCost) * 100,
  };
}

export function computeSplitMergePayout(
  totalCost: number,
  maxPositionSize: number,
): { pairs: number; netProfit: number; totalFees: number; actualProfitPct: number } {
  const pairs = maxPositionSize / totalCost;
  const totalFees = pairs * POLY_FEE;
  const netProfit = pairs - totalFees - maxPositionSize;
  const actualProfitPct = (netProfit / (maxPositionSize || 1)) * 100;
  return { pairs, netProfit, totalFees, actualProfitPct };
}

export function createFailedSplitMergeResult(
  opportunityId: string,
  error: string,
  executedAt = Date.now(),
): ExecutionResult {
  return {
    opportunityId,
    success: false,
    executedLegs: [],
    actualProfit: 0,
    actualProfitPct: 0,
    totalFees: 0,
    error,
    executedAt,
  };
}
