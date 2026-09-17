/*
 * Shared fixtures & factories for unified-executor tests.
 */
import {
  ArbitrageOpportunity,
  ArbitrageLeg,
  UnifiedExecutorConfig,
  BinaryArbitrageOpportunity,
  SplitMergeArbitrageOpportunity,
  CrossMarketArbitrageOpportunity,
} from '../types';

export const createMockLeg = (overrides: Partial<ArbitrageLeg> = {}): ArbitrageLeg => ({
  exchange: 'binance',
  symbol: 'BTC/USDT',
  side: 'buy',
  price: 50000,
  amount: 0.1,
  fee: 5,
  ...overrides,
});

export const createMockOpportunity = (
  type: ArbitrageOpportunity['type'],
  overrides: Partial<ArbitrageOpportunity> = {}
): ArbitrageOpportunity => ({
  id: `opp-${Date.now()}`,
  type,
  legs: [createMockLeg(), createMockLeg({ side: 'sell' })],
  expectedProfit: 100,
  expectedProfitPct: 1.0,
  totalFees: 10,
  confidence: 0.9,
  detectedAt: Date.now(),
  expiresAt: Date.now() + 60000,
  ...overrides,
});

export const createBinaryOpportunity = (
  overrides: Partial<BinaryArbitrageOpportunity> = {}
): BinaryArbitrageOpportunity => ({
  ...createMockOpportunity('binary-arb', { expectedProfitPct: 1.0 }),
  market: {
    conditionId: 'test-market',
    question: 'Test market?',
    yesPrice: 0.45,
    noPrice: 0.45,
    volume: 100000,
    liquidity: 50000,
    endDate: new Date(Date.now() + 86400000),
    resolved: false,
  },
  mispricing: 0.1,
  edge: 'both-cheap',
  ...overrides,
});

export const createSplitMergeOpportunity = (
  overrides: Partial<SplitMergeArbitrageOpportunity> = {}
): SplitMergeArbitrageOpportunity => ({
  ...createMockOpportunity('settlement-arb'),
  marketId: 'market-123',
  title: 'Test Market',
  yesPrice: 0.48,
  noPrice: 0.48,
  totalCost: 960,
  profit: 40,
  profitPercent: 4.17,
  ...overrides,
});

export const createCrossMarketOpportunity = (
  overrides: Partial<CrossMarketArbitrageOpportunity> = {}
): CrossMarketArbitrageOpportunity => ({
  ...createMockOpportunity('cross-market'),
  basket: {
    id: 'basket-1',
    positions: [
      { marketId: 'market-1', side: 'YES', size: 100, expectedProfit: 5 },
      { marketId: 'market-2', side: 'NO', size: 150, expectedProfit: 8 },
    ],
    totalExpectedProfit: 13,
    totalCost: 25000,
  },
  ...overrides,
});

export const defaultUnifiedConfig: UnifiedExecutorConfig = {
  dryRun: true,
  maxPositionSize: 1000,
  slippageTolerance: 0.5,
  minProfitThreshold: 0.5,
  timeoutMs: 5000,
  binary: { dryRun: true, maxPositionSize: 1000, kellyFraction: 0.25, maxDrawdownPct: 0.2 },
  splitMerge: { dryRun: true, maxPositionSize: 1000, minProfitThreshold: 0.001, minVolume: 5000 },
  crossMarket: { dryRun: true, budgetUsdc: 10000, maxMarketExposureFraction: 0.2, minEdgeThreshold: 0.025, feeRate: 0.02, timeoutMs: 500 },
};
