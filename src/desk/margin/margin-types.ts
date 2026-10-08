/**
 * Collateral & Cross-Margining Optimization Types
 * ISDA SIMM v2.6 Initial Margin (IM), Variation Margin (VM), SPAN portfolio offsets, and collateral waterfalls.
 *
 * @module desk/margin/margin-types
 */

export interface SensitivityBucket {
  bucketId: string;
  riskWeight: number; // e.g., 0.15 for 15%
  netDeltaSensitivity: number; // Net delta in USD
  vegaSensitivity: number; // Net vega in USD
  curvatureSensitivity: number; // Net curvature in USD
}

export interface IsdaSimmMarginResult {
  deltaMarginUsd: number;
  vegaMarginUsd: number;
  curvatureMarginUsd: number;
  totalInitialMarginUsd: number;
  concentrationScaleFactor: number;
}

export interface ContractPosition {
  symbol: string;
  assetClass: 'EQUITY' | 'FX' | 'RATES' | 'COMMODITY' | 'CRYPTO';
  quantity: number;
  contractMultiplier: number;
  marketPrice: number;
  standaloneMarginRequirementUsd: number;
}

export interface CrossMarginOffsetMatrix {
  correlationMatrix: { [pair: string]: number }; // e.g. "EQUITY:CRYPTO": 0.40
}

export interface CrossMarginPortfolioResult {
  grossStandaloneMarginUsd: number;
  diversifiedMarginRequirementUsd: number;
  marginSavingsUsd: number;
  capitalEfficiencyRatio: number; // e.g., 1.35x capital leverage
}

export interface CollateralHolding {
  holdingId: string;
  assetClass: 'CASH' | 'SOVEREIGN_DEBT' | 'INVESTMENT_GRADE_BOND' | 'EQUITY' | 'CRYPTO';
  marketValueUsd: number;
  haircutPercentage: number; // e.g., 0.05 for 5%
  liquidityTier: 1 | 2 | 3 | 4; // 1 is highest liquidity
}

export interface CollateralAllocationResult {
  totalRequiredCollateralUsd: number;
  totalPledgedPostHaircutUsd: number;
  isFullyCollateralized: boolean;
  allocations: {
    holdingId: string;
    pledgedPreHaircutUsd: number;
    pledgedPostHaircutUsd: number;
    remainingAvailableUsd: number;
  }[];
  excessCollateralUsd: number;
}
