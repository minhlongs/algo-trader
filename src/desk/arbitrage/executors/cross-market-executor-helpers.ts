/**
 * Cross-market ILP arbitrage executor helper functions and config types.
 */

import type {
  ExecutionResult,
  CrossMarketArbitrageOpportunity,
} from '../types';
import type {
  MarketPrice,
  DetectorResult,
} from '../cross-market-arbitrage-detector';

export interface CrossMarketExecutorConfig {
  budgetUsdc: number;
  maxMarketExposureFraction: number;
  minEdgeThreshold: number;
  feeRate: number;
  timeoutMs: number;
  dryRun: boolean;
}

export function resolveCrossMarketConfig(
  config: Partial<CrossMarketExecutorConfig> = {},
): CrossMarketExecutorConfig {
  return {
    budgetUsdc: config.budgetUsdc ?? 10000,
    maxMarketExposureFraction: config.maxMarketExposureFraction ?? 0.2,
    minEdgeThreshold: config.minEdgeThreshold ?? 0.025,
    feeRate: config.feeRate ?? 0.02,
    timeoutMs: config.timeoutMs ?? 500,
    dryRun: config.dryRun ?? true,
  };
}

export function buildFailedExecutionResult(
  opportunityId: string,
  error: string,
): ExecutionResult {
  return {
    opportunityId,
    success: false,
    executedLegs: [],
    actualProfit: 0,
    actualProfitPct: 0,
    totalFees: 0,
    error,
    executedAt: Date.now(),
  };
}

export function mapPositionsToMarketPrices(
  positions: CrossMarketArbitrageOpportunity['basket']['positions'],
): MarketPrice[] {
  return positions.map((pos) => ({
    marketId: pos.marketId,
    question: '',
    yesPrice: pos.side === 'YES' ? pos.expectedProfit / pos.size + 0.5 : 0.5,
    noPrice: pos.side === 'NO' ? pos.expectedProfit / pos.size + 0.5 : 0.5,
    liquidity: 50000,
  }));
}

export function buildSuccessExecutionResult(
  opportunityId: string,
  basket: NonNullable<DetectorResult['basket']>,
  feeRate: number,
): ExecutionResult {
  return {
    opportunityId,
    success: true,
    executedLegs: basket.positions.map((pos) => ({
      exchange: 'polymarket',
      symbol: pos.marketId,
      side: pos.side.toLowerCase() as 'buy' | 'sell',
      executedPrice: pos.side === 'YES' ? pos.expectedProfit / pos.size + 0.5 : 0.5,
      executedAmount: pos.size,
      fee: pos.size * feeRate,
    })),
    actualProfit: basket.totalExpectedProfit,
    actualProfitPct: (basket.totalExpectedProfit / basket.totalCost) * 100,
    totalFees: basket.totalCost * feeRate,
    executedAt: Date.now(),
  };
}
