/**
 * Profitability Decision Engine
 * Evaluates hurdle thresholds, spread sanity, and classifies opportunity rejection reasons.
 */

import {
  type NetProfitabilityAnalysis,
  type RejectionReason,
  type VwapSlippageResult,
  HURDLE_EPSILON_BPS,
} from './profitability-types';

export function buildInvalidResponse(_reason: string): NetProfitabilityAnalysis {
  return {
    isProfitable: false,
    grossSpreadUsd: 0,
    grossSpreadBps: 0,
    estimatedBuyFeeUsd: 0,
    estimatedSellFeeUsd: 0,
    estimatedGasUsd: 0,
    estimatedBuySlippageUsd: 0,
    estimatedSellSlippageUsd: 0,
    totalCostUsd: 0,
    netProfitUsd: 0,
    netProfitBps: 0,
    rejectionReason: 'INVALID_INPUT',
  };
}

export function classifyRejection(
  hasZeroDepth: boolean,
  buySlippageResult: VwapSlippageResult,
  sellSlippageResult: VwapSlippageResult,
  grossSpreadUsd: number,
  totalFeesUsd: number,
  estimatedGasUsd: number,
  totalCostUsd: number,
  netProfitUsd: number,
  netProfitBps: number,
  minHurdleBps: number
): { isProfitable: boolean; rejectionReason?: RejectionReason } {
  if (hasZeroDepth) {
    return { isProfitable: false, rejectionReason: 'ZERO_ORDERBOOK_DEPTH' };
  }
  if (buySlippageResult.insufficientLiquidity || sellSlippageResult.insufficientLiquidity) {
    return { isProfitable: false, rejectionReason: 'INSUFFICIENT_LIQUIDITY' };
  }
  if (totalFeesUsd >= grossSpreadUsd) {
    return { isProfitable: false, rejectionReason: 'MASSIVE_FEE_SPIKE' };
  }
  if (estimatedGasUsd >= grossSpreadUsd - totalFeesUsd) {
    return { isProfitable: false, rejectionReason: 'MASSIVE_GAS_SPIKE' };
  }
  if (
    totalCostUsd >= grossSpreadUsd ||
    netProfitUsd <= 0 ||
    netProfitBps < minHurdleBps - HURDLE_EPSILON_BPS
  ) {
    return { isProfitable: false, rejectionReason: 'BELOW_HURDLE' };
  }
  return { isProfitable: true, rejectionReason: undefined };
}
