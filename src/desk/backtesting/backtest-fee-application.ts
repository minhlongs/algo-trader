/**
 * Backtest Fee Application
 *
 * Single seam where venue trading costs enter the backtest ledger.
 *
 * Supports both default venue fee/gas profiles (`DEFAULT_FEE_GAS_PROFILES`) and
 * opt-in Polymarket CLOB V2 quadratic taker fees / maker rebates (`clobV2Category`,
 * `postOnly`).
 */

import { DEFAULT_FEE_GAS_PROFILES } from '../sor/fee-gas-model';
import {
  calcMakerRebateV2,
  calcQuadraticTakerFeeV2,
  type PolymarketCategory,
} from '../polymarket/polymarket-fee-calculator';

/** Venue the backtest ledger prices against. */
export const BACKTEST_VENUE = 'polymarket_clob';

export interface VenueCostInput {
  /** Closing fill price per share. */
  price: number;
  /** Shares filled. */
  size: number;
  /** Gross PnL for this close, before any venue cost. */
  grossPnl: number;
  /** Optional entry price per share for CLOB V2 entry-leg fee/rebate pricing. */
  entryPrice?: number;
  /** Opt-in Polymarket CLOB V2 market category for quadratic fee / maker rebate calculation. */
  clobV2Category?: PolymarketCategory;
  /** When true under CLOB V2, treats both legs as passive `postOnly` maker orders (`0` taker fee + maker rebate). */
  postOnly?: boolean;
}

export interface VenueCostBreakdown {
  /** Trading fee charged on this close. */
  feeUsd: number;
  /** Fixed gas charged on this close. */
  gasUsd: number;
  /** Maker rebate earned on this close (0 unless `clobV2Category` + `postOnly` are enabled). */
  rebateUsd: number;
  /** feeUsd + gasUsd. */
  totalCostUsd: number;
  /** grossPnl - totalCostUsd + rebateUsd. */
  netPnl: number;
}

/**
 * Subtract taker fees and gas (and credit optional CLOB V2 maker rebates) from one closing fill.
 *
 * When `clobV2Category` is omitted, preserves the flat `takerFeeBps` model on
 * `DEFAULT_FEE_GAS_PROFILES[BACKTEST_VENUE]`. When `clobV2Category` is provided,
 * prices both the entry leg (`entryPrice ?? price`) and exit leg (`price`) with
 * `calcQuadraticTakerFeeV2` (or `calcMakerRebateV2` when `postOnly === true`).
 */
export function applyVenueCosts(
  { price, size, grossPnl, entryPrice, clobV2Category, postOnly }: VenueCostInput,
  gasFills = 2,
): VenueCostBreakdown {
  const profile = DEFAULT_FEE_GAS_PROFILES[BACKTEST_VENUE];
  let feeUsd: number;
  let rebateUsd = 0;

  if (clobV2Category) {
    const entryProb = entryPrice ?? price;
    const exitProb = price;
    if (postOnly) {
      feeUsd = 0;
      rebateUsd =
        calcMakerRebateV2(clobV2Category, entryProb, size) +
        calcMakerRebateV2(clobV2Category, exitProb, size);
    } else {
      feeUsd =
        calcQuadraticTakerFeeV2(clobV2Category, entryProb, size, false) +
        calcQuadraticTakerFeeV2(clobV2Category, exitProb, size, false);
    }
  } else {
    const notionalUsd = price * size;
    const feePerLegUsd = notionalUsd * (profile.takerFeeBps / 10000);
    feeUsd = feePerLegUsd * 2;
  }

  const gasUsd = profile.gasCostUsd * gasFills;

  // Round in dependency order so netPnl === grossPnl - (feeUsd + gasUsd) + rebateUsd to the cent.
  const feeUsdRounded = roundUsd(feeUsd);
  const gasUsdRounded = roundUsd(gasUsd);
  const rebateUsdRounded = roundUsd(rebateUsd);
  const totalCostUsd = roundUsd(feeUsdRounded + gasUsdRounded);
  const netPnl = roundUsd(roundUsd(grossPnl) - totalCostUsd + rebateUsdRounded);

  return {
    feeUsd: feeUsdRounded,
    gasUsd: gasUsdRounded,
    rebateUsd: rebateUsdRounded,
    totalCostUsd,
    netPnl,
  };
}

/** Round to the cent so the ledger cannot accumulate sub-cent drift across a run. */
function roundUsd(value: number): number {
  return Math.round(value * 100) / 100;
}
