/**
 * Binary Constant Product Market Maker (CPMM) Engine
 * Invariant: k = R_x * R_y
 * Closed-form quadratic inverse for zero round-trip leak.
 */

import {
  CpmmBuyResult,
  CpmmLiquidityResult,
  CpmmReserves,
  CpmmSellResult,
  CpmmSpotPrices,
  CpmmSwapResult,
} from '../types/cpmm-types';
import {
  calculateSpotPrices,
  calculateBuy,
  calculateSell,
  calculateDirectSwap,
} from './cpmm-pricing-math';
import { calculateAddLiquidity, calculateRemoveLiquidity } from './cpmm-liquidity';

export {
  calculateSpotPrices,
  calculateBuy,
  calculateSell,
  calculateDirectSwap,
  calculateAddLiquidity,
  calculateRemoveLiquidity,
};

export class CpmmPricing {
  public static calculateSpotPrices(reserves: CpmmReserves): CpmmSpotPrices {
    return calculateSpotPrices(reserves);
  }

  public static calculateBuy(
    outcome: 'YES' | 'NO',
    usdcIn: number,
    reserves: CpmmReserves,
    feeBps: number = 0
  ): CpmmBuyResult {
    return calculateBuy(outcome, usdcIn, reserves, feeBps);
  }

  public static calculateSell(
    outcome: 'YES' | 'NO',
    sharesIn: number,
    reserves: CpmmReserves,
    feeBps: number = 0
  ): CpmmSellResult {
    return calculateSell(outcome, sharesIn, reserves, feeBps);
  }

  public static calculateDirectSwap(
    inputToken: 'YES' | 'NO',
    inputAmount: number,
    reserves: CpmmReserves,
    feeBps: number = 0
  ): CpmmSwapResult {
    return calculateDirectSwap(inputToken, inputAmount, reserves, feeBps);
  }

  public static calculateAddLiquidity(
    deltaYes: number,
    deltaNo: number,
    reserves: CpmmReserves,
    totalLpShares: number
  ): CpmmLiquidityResult {
    return calculateAddLiquidity(deltaYes, deltaNo, reserves, totalLpShares);
  }

  public static calculateRemoveLiquidity(
    lpSharesToBurn: number,
    reserves: CpmmReserves,
    totalLpShares: number
  ): CpmmLiquidityResult {
    return calculateRemoveLiquidity(lpSharesToBurn, reserves, totalLpShares);
  }
}
