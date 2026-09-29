/**
 * Binary Constant Product Market Maker (CPMM) Types & Interfaces
 * Invariant: k = R_yes * R_no
 */

export interface CpmmReserves {
  yesReserve: number; // R_x
  noReserve: number;  // R_y
  k: number;          // R_x * R_y
}

export interface CpmmConfig {
  feeBps: number;
  minLiquidity?: number;
}

export interface CpmmSpotPrices {
  yesPrice: number; // R_y / (R_x + R_y)
  noPrice: number;  // R_x / (R_x + R_y)
}

export interface CpmmBuyResult {
  outcome: 'YES' | 'NO';
  usdcIn: number;
  netUsdcIn: number;
  sharesOut: number;
  feePaidUsdc: number;
  spotPriceBefore: number;
  spotPriceAfter: number;
  averagePrice: number;
  newReserves: CpmmReserves;
}

export interface CpmmSellResult {
  outcome: 'YES' | 'NO';
  sharesIn: number;
  grossUsdcOut: number;
  netUsdcOut: number;
  feePaidUsdc: number;
  spotPriceBefore: number;
  spotPriceAfter: number;
  averagePrice: number;
  newReserves: CpmmReserves;
}

export interface CpmmSwapResult {
  inputToken: 'YES' | 'NO';
  outputToken: 'YES' | 'NO';
  inputAmount: number;
  outputAmount: number;
  feePaidShares: number;
  spotPriceBefore: number;
  spotPriceAfter: number;
  executionPrice: number;
  newReserves: CpmmReserves;
}

export interface CpmmLiquidityResult {
  lpSharesDelta: number;
  totalLpShares: number;
  deltaYes: number;
  deltaNo: number;
  newReserves: CpmmReserves;
}
