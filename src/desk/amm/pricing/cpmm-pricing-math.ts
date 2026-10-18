/**
 * Pure Constant-Product Reserve, Slippage, and Spot Pricing Math for CPMM.
 *
 * @module desk/amm/pricing/cpmm-pricing-math
 */

import type {
  CpmmBuyResult,
  CpmmReserves,
  CpmmSellResult,
  CpmmSpotPrices,
  CpmmSwapResult,
} from '../types/cpmm-types';

export function calculateSpotPrices(reserves: CpmmReserves): CpmmSpotPrices {
  const sum = reserves.yesReserve + reserves.noReserve;
  if (sum <= 0) throw new Error('Reserves sum must be strictly positive');
  return { yesPrice: reserves.noReserve / sum, noPrice: reserves.yesReserve / sum };
}

export function calculateBuy(
  outcome: 'YES' | 'NO',
  usdcIn: number,
  reserves: CpmmReserves,
  feeBps: number = 0
): CpmmBuyResult {
  if (usdcIn <= 0) throw new Error('usdcIn must be positive');
  const feePaidUsdc = usdcIn * (feeBps / 10000);
  const netUsdcIn = usdcIn - feePaidUsdc;
  const spotBefore = calculateSpotPrices(reserves);
  const k = reserves.k;
  let sharesOut: number;
  let newRx: number;
  let newRy: number;

  if (outcome === 'YES') {
    newRy = reserves.noReserve + netUsdcIn;
    newRx = k / newRy;
    sharesOut = netUsdcIn * ((reserves.yesReserve + reserves.noReserve + netUsdcIn) / newRy);
  } else {
    newRx = reserves.yesReserve + netUsdcIn;
    newRy = k / newRx;
    sharesOut = netUsdcIn * ((reserves.yesReserve + reserves.noReserve + netUsdcIn) / newRx);
  }

  const newReserves: CpmmReserves = { yesReserve: newRx, noReserve: newRy, k };
  const spotAfter = calculateSpotPrices(newReserves);
  return {
    outcome,
    usdcIn,
    netUsdcIn,
    sharesOut,
    feePaidUsdc,
    spotPriceBefore: outcome === 'YES' ? spotBefore.yesPrice : spotBefore.noPrice,
    spotPriceAfter: outcome === 'YES' ? spotAfter.yesPrice : spotAfter.noPrice,
    averagePrice: usdcIn / sharesOut,
    newReserves,
  };
}

export function calculateSell(
  outcome: 'YES' | 'NO',
  sharesIn: number,
  reserves: CpmmReserves,
  feeBps: number = 0
): CpmmSellResult {
  if (sharesIn <= 0) throw new Error('sharesIn must be positive');
  const Rx = reserves.yesReserve;
  const Ry = reserves.noReserve;
  const k = reserves.k;
  const spotBefore = calculateSpotPrices(reserves);
  const B = Rx + Ry + sharesIn;
  const D = outcome === 'YES' ? sharesIn * Ry : sharesIn * Rx;
  const discriminant = B * B - 4 * D;
  if (discriminant < 0) throw new Error('CPMM sell shares exceeds pool liquidity');

  const grossUsdcOut = (B - Math.sqrt(discriminant)) / 2;
  const feePaidUsdc = grossUsdcOut * (feeBps / 10000);
  const netUsdcOut = grossUsdcOut - feePaidUsdc;

  let newRx: number;
  let newRy: number;
  if (outcome === 'YES') {
    newRy = Ry - grossUsdcOut;
    if (newRy <= 0) throw new Error('Selling leaves insufficient NO reserve');
    newRx = k / newRy;
  } else {
    newRx = Rx - grossUsdcOut;
    if (newRx <= 0) throw new Error('Selling leaves insufficient YES reserve');
    newRy = k / newRx;
  }

  const newReserves: CpmmReserves = { yesReserve: newRx, noReserve: newRy, k };
  const spotAfter = calculateSpotPrices(newReserves);
  return {
    outcome,
    sharesIn,
    grossUsdcOut,
    netUsdcOut,
    feePaidUsdc,
    spotPriceBefore: outcome === 'YES' ? spotBefore.yesPrice : spotBefore.noPrice,
    spotPriceAfter: outcome === 'YES' ? spotAfter.yesPrice : spotAfter.noPrice,
    averagePrice: netUsdcOut / sharesIn,
    newReserves,
  };
}

export function calculateDirectSwap(
  inputToken: 'YES' | 'NO',
  inputAmount: number,
  reserves: CpmmReserves,
  feeBps: number = 0
): CpmmSwapResult {
  if (inputAmount <= 0) throw new Error('inputAmount must be positive');
  const feePaidShares = inputAmount * (feeBps / 10000);
  const netInput = inputAmount - feePaidShares;
  const spotBefore = calculateSpotPrices(reserves);
  let newRx: number;
  let newRy: number;
  let outputAmount: number;
  const outputToken = inputToken === 'YES' ? 'NO' : 'YES';

  if (inputToken === 'YES') {
    newRx = reserves.yesReserve + netInput;
    newRy = reserves.k / newRx;
    outputAmount = reserves.noReserve - newRy;
  } else {
    newRy = reserves.noReserve + netInput;
    newRx = reserves.k / newRy;
    outputAmount = reserves.yesReserve - newRx;
  }

  const newReserves: CpmmReserves = { yesReserve: newRx, noReserve: newRy, k: reserves.k };
  const spotAfter = calculateSpotPrices(newReserves);
  return {
    inputToken,
    outputToken,
    inputAmount,
    outputAmount,
    feePaidShares,
    spotPriceBefore: inputToken === 'YES' ? spotBefore.yesPrice : spotBefore.noPrice,
    spotPriceAfter: inputToken === 'YES' ? spotAfter.yesPrice : spotAfter.noPrice,
    executionPrice: outputAmount / inputAmount,
    newReserves,
  };
}
