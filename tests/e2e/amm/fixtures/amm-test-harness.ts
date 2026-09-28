/**
 * AMM Test Harness & Unified Loader.
 * Bridges production modules from src/desk/amm (when implemented)
 * with reference components to provide a complete, verified execution suite.
 */

export * from './amm-contracts';
export * from './amm-reference-components';

import type {
  MultiTokenPoolConfig,
  MultiOutcomeMarket,
  OutcomeOrderBook,
  RiskContext,
} from './amm-contracts';

/**
 * Creates a standard mock multi-outcome market for testing
 */
export function createMockMarket(
  outcomeCount: number = 3,
  priceSum: number = 1.0,
  spread: number = 0.02
): MultiOutcomeMarket {
  const baseProb = priceSum / outcomeCount;
  const halfSpread = spread / 2;

  const outcomes = Array.from({ length: outcomeCount }, (_, i) => {
    const outcomeId = `OUTCOME_${i + 1}`;
    const spot = baseProb;
    return {
      outcomeId,
      bestBid: Math.max(0.01, spot - halfSpread),
      bestAsk: Math.min(0.99, spot + halfSpread),
      bidDepthUsd: 10_000,
      askDepthUsd: 10_000,
      spotPrice: spot,
    };
  });

  return {
    marketId: `market-${outcomeCount}-outcomes`,
    title: `${outcomeCount}-Outcome Prediction Market`,
    outcomes,
    collateralToken: 'USDC',
    feeBps: 20, // 20 bps
  };
}

/**
 * Creates orderbook depth maps for given market
 */
export function createMockOrderbooks(
  market: MultiOutcomeMarket,
  depthLevels: number = 5
): Record<string, OutcomeOrderBook> {
  const books: Record<string, OutcomeOrderBook> = {};

  for (const o of market.outcomes) {
    const bids = Array.from({ length: depthLevels }, (_, i) => ({
      price: Math.max(0.01, o.bestBid - i * 0.005),
      size: 200 + i * 100,
    }));
    const asks = Array.from({ length: depthLevels }, (_, i) => ({
      price: Math.min(0.99, o.bestAsk + i * 0.005),
      size: 200 + i * 100,
    }));

    books[o.outcomeId] = {
      outcomeId: o.outcomeId,
      bids,
      asks,
    };
  }

  return books;
}

/**
 * Creates standard risk context for testing
 */
export function createDefaultRiskContext(overrides?: Partial<RiskContext>): RiskContext {
  return {
    portfolioEquityUsd: 100_000,
    peakDailyEquityUsd: 100_000,
    currentDailyEquityUsd: 100_000,
    currentPoolExposureUsd: 10_000,
    openOrdersCount: 2,
    ...overrides,
  };
}

/**
 * Creates standard multi-token pool config
 */
export function createDefaultPoolConfig(outcomeCount: number = 3): MultiTokenPoolConfig {
  return {
    poolId: `pool-${outcomeCount}-test`,
    name: `Test Pool ${outcomeCount} Outcomes`,
    engineType: 'LMSR',
    outcomes: Array.from({ length: outcomeCount }, (_, i) => ({
      id: `OUT_${i + 1}`,
      name: `Outcome ${i + 1}`,
      symbol: `O${i + 1}`,
    })),
    initialB: 1_000,
    initialCollateral: 10_000,
    feeBps: 25,
  };
}
