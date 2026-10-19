/**
 * Liquidity operations (minting/burning LP shares) for Constant Product Market Maker (CPMM).
 *
 * @module desk/amm/pricing/cpmm-liquidity
 */

import type { CpmmLiquidityResult, CpmmReserves } from '../types/cpmm-types';

export function calculateAddLiquidity(
  deltaYes: number,
  deltaNo: number,
  reserves: CpmmReserves,
  totalLpShares: number
): CpmmLiquidityResult {
  if (deltaYes <= 0 || deltaNo <= 0) throw new Error('Deltas must be positive');
  const lpSharesDelta = totalLpShares === 0
    ? Math.sqrt(deltaYes * deltaNo)
    : totalLpShares * Math.min(deltaYes / reserves.yesReserve, deltaNo / reserves.noReserve);

  const newRx = reserves.yesReserve + deltaYes;
  const newRy = reserves.noReserve + deltaNo;
  return {
    lpSharesDelta,
    totalLpShares: totalLpShares + lpSharesDelta,
    deltaYes,
    deltaNo,
    newReserves: { yesReserve: newRx, noReserve: newRy, k: newRx * newRy },
  };
}

export function calculateRemoveLiquidity(
  lpSharesToBurn: number,
  reserves: CpmmReserves,
  totalLpShares: number
): CpmmLiquidityResult {
  if (lpSharesToBurn <= 0 || lpSharesToBurn > totalLpShares) throw new Error('Invalid LP shares to burn');
  const shareRatio = lpSharesToBurn / totalLpShares;
  const deltaYes = reserves.yesReserve * shareRatio;
  const deltaNo = reserves.noReserve * shareRatio;
  const newRx = reserves.yesReserve - deltaYes;
  const newRy = reserves.noReserve - deltaNo;
  return {
    lpSharesDelta: -lpSharesToBurn,
    totalLpShares: totalLpShares - lpSharesToBurn,
    deltaYes,
    deltaNo,
    newReserves: { yesReserve: newRx, noReserve: newRy, k: newRx * newRy },
  };
}
