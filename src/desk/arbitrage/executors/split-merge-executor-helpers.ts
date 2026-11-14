/**
 * Pure validation, opportunity conversion, payout calculation, and CLOB V2
 * Taker-BUY share-deduction merge-parity helpers for SplitMergeArbitrageExecutor.
 */

import type {
  ArbitrageOpportunity,
  ExecutionResult,
  SplitMergeArbitrageOpportunity,
} from '../types';
import type { SplitMergeOpportunity } from '../split-merge-arb-executor';
import {
  calcQuadraticTakerFeeV2,
  computeTakerBuyNetSharesAndMergeablePairs,
  DEFAULT_CLOB_V2_CATEGORY,
  type PolymarketCategory,
} from '../../polymarket/polymarket-fee-calculator';

export const POLY_FEE = 0.02;

export interface TakerBuyMergeGuardDecision {
  allowed: boolean;
  reason?: 'SHARE_DEDUCTION_SHORTFALL' | 'NON_POSITIVE_REQUESTED_PAIRS';
  requestedPairs: number;
  yesOrderShares: number;
  noOrderShares: number;
  yesFeeRate: number;
  noFeeRate: number;
  yesNetShares: number;
  noNetShares: number;
  mergeablePairs: number;
  shortfallPairs: number;
  grossUpYesShares: number;
  grossUpNoShares: number;
}

/**
 * Evaluates whether the ordered YES and NO leg share quantities deliver at least
 * `requestedPairs` complete mergeable pairs after CLOB V2 Taker-BUY share deduction.
 */
export function evaluateTakerBuyMergeParity(
  requestedPairs: number,
  yesOrderShares: number,
  noOrderShares: number,
  yesAsk: number,
  noAsk: number,
  category: PolymarketCategory,
): TakerBuyMergeGuardDecision {
  const parity = computeTakerBuyNetSharesAndMergeablePairs(
    requestedPairs,
    yesAsk,
    noAsk,
    category,
  );
  const safeYesOrder = Math.max(0, yesOrderShares);
  const safeNoOrder = Math.max(0, noOrderShares);
  const yesNetShares = safeYesOrder * (1 - parity.yesFeeRate);
  const noNetShares = safeNoOrder * (1 - parity.noFeeRate);
  const mergeablePairs = Math.min(yesNetShares, noNetShares);

  if (requestedPairs <= 0) {
    return {
      allowed: false,
      reason: 'NON_POSITIVE_REQUESTED_PAIRS',
      requestedPairs: parity.requestedPairs,
      yesOrderShares: safeYesOrder,
      noOrderShares: safeNoOrder,
      yesFeeRate: parity.yesFeeRate,
      noFeeRate: parity.noFeeRate,
      yesNetShares,
      noNetShares,
      mergeablePairs,
      shortfallPairs: 0,
      grossUpYesShares: parity.grossUpYesShares,
      grossUpNoShares: parity.grossUpNoShares,
    };
  }

  const shortfallPairs = Math.max(0, parity.requestedPairs - mergeablePairs);
  const allowed = mergeablePairs >= parity.requestedPairs - 1e-9;

  return {
    allowed,
    ...(allowed ? {} : { reason: 'SHARE_DEDUCTION_SHORTFALL' as const }),
    requestedPairs: parity.requestedPairs,
    yesOrderShares: safeYesOrder,
    noOrderShares: safeNoOrder,
    yesFeeRate: parity.yesFeeRate,
    noFeeRate: parity.noFeeRate,
    yesNetShares,
    noNetShares,
    mergeablePairs,
    shortfallPairs: allowed ? 0 : shortfallPairs,
    grossUpYesShares: parity.grossUpYesShares,
    grossUpNoShares: parity.grossUpNoShares,
  };
}

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

/**
 * Computes split-merge payout under CLOB V2 quadratic taker fees and share deduction.
 */
export function computeSplitMergePayoutV2(
  yesAsk: number,
  noAsk: number,
  maxPositionSize: number,
  category: PolymarketCategory = DEFAULT_CLOB_V2_CATEGORY,
  yesOrderShares?: number,
  noOrderShares?: number,
): {
  pairs: number;
  mergeablePairs: number;
  netProfit: number;
  totalFees: number;
  actualProfitPct: number;
} {
  const totalCost = yesAsk + noAsk;
  const pairs = totalCost > 0 ? maxPositionSize / totalCost : 0;
  const parity = computeTakerBuyNetSharesAndMergeablePairs(pairs, yesAsk, noAsk, category);
  const effYesShares = yesOrderShares ?? pairs;
  const effNoShares = noOrderShares ?? pairs;
  const mergeablePairs =
    yesOrderShares !== undefined && noOrderShares !== undefined
      ? Math.min(effYesShares * (1 - parity.yesFeeRate), effNoShares * (1 - parity.noFeeRate))
      : parity.mergeablePairs;
  const effectiveNotional =
    yesOrderShares !== undefined && noOrderShares !== undefined
      ? effYesShares * yesAsk + effNoShares * noAsk
      : maxPositionSize;
  const yesFeeUsdc = calcQuadraticTakerFeeV2(category, yesAsk, effYesShares) * yesAsk;
  const noFeeUsdc = calcQuadraticTakerFeeV2(category, noAsk, effNoShares) * noAsk;
  const totalFees = yesFeeUsdc + noFeeUsdc;
  const netProfit = mergeablePairs - effectiveNotional;
  const actualProfitPct = (netProfit / (effectiveNotional || 1)) * 100;
  return { pairs, mergeablePairs, netProfit, totalFees, actualProfitPct };
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
