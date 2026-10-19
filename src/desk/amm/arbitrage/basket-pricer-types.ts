/**
 * Type definitions for BasketPricer.
 *
 * @module desk/amm/arbitrage/basket-pricer-types
 */

export interface BasketPricingConfig {
  gasLimit?: number; // baseline 500,000 gas buffer
  gasPriceGwei?: number;
  ethPriceUsd?: number;
  fixedGasUsd?: number;
  mintFeeBps?: number;
  mergeFeeBps?: number;
  takerFeeBps?: number;
  minProfitHurdleUsd?: number;
}

export interface BasketValuation {
  maxExecutableSets: number;
  optimalSets: number;
  grossEdge: number;
  netEdge: number;
  expectedProfitUsd: number;
  expectedRoi: number;
  totalCostUsd: number;
  totalRevenueUsd: number;
  estimatedFeesUsd: number;
  estimatedGasUsd: number;
  vwapPrices: number[];
  isProfitable: boolean;
}
