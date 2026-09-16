/**
 * ILP Constraint Builder Test Fixtures
 */

import type { MarketOpportunity, ILPSolverConfig } from '../../../shared/types/ilp-types';

export const defaultSolverConfig: ILPSolverConfig = {
  budgetUsdc: 10000,
  maxMarketExposureFraction: 0.2, // 20% per market
  minEdgeThreshold: 0.025, // 2.5%
  feeRate: 0.02,
  timeoutMs: 500,
};

export const sampleMarkets: MarketOpportunity[] = [
  {
    marketId: 'market_1',
    question: 'Market 1',
    yesPrice: 0.45,
    noPrice: 0.50,
    expectedEdge: 0.05,
    liquidity: 50000,
  },
  {
    marketId: 'market_2',
    question: 'Market 2',
    yesPrice: 0.50,
    noPrice: 0.45,
    expectedEdge: 0.05,
    liquidity: 50000,
  },
];

export function createManyMarkets(count: number): MarketOpportunity[] {
  return Array.from({ length: count }, (_, i) => ({
    marketId: `market_${i}`,
    question: `Market ${i}`,
    yesPrice: 0.40 + (i % 10) * 0.01,
    noPrice: 0.50 + (i % 10) * 0.01,
    expectedEdge: 0.05,
    liquidity: 50000,
  }));
}
