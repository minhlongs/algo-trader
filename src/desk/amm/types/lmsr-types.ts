/**
 * LMSR Specific Types & Interfaces
 * Logarithmic Market Scoring Rule Pricing & Dynamic Liquidity
 */

export interface LmsrConfig {
  b: number; // liquidity parameter in currency units (e.g. USDC)
  minB?: number;
  maxB?: number;
  feeBps?: number;
}

export interface LmsrState {
  b: number;
  liabilities: number[]; // q_i shares per outcome
  outcomes: string[];
}

export interface LmsrTradeQuote {
  outcomeIndex: number;
  deltaShares: number;
  costUsdc: number;
  averagePrice: number;
  spotPriceBefore: number;
  spotPriceAfter: number;
  feeUsdc: number;
}

export interface LmsrDynamicBConfig {
  baseB: number;
  minB: number;
  maxB: number;
  volumeTargetUsd: number;
  volumeSensitivity: number; // kappa_v
  beta: number; // elasticity power
}

export interface DynamicBAdjustmentResult {
  previousB: number;
  newB: number;
  scalingFactor: number;
  collateralDeltaUsdc: number;
  previousLiabilities: number[];
  scaledLiabilities: number[];
  spotPricesBefore: number[];
  spotPricesAfter: number[];
}

export interface DynamicBParams {
  currentB: number;
  currentLiabilities: number[];
  availableCollateralUsdc: number;
  rolling24hVolumeUsdc: number;
  config: LmsrDynamicBConfig;
}
