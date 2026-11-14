/**
 * Backtest Fee Application
 *
 * Single seam where venue trading costs enter the backtest ledger.
 * Supports default venue profiles, per-token parabolic `PolymarketFeeSchedule`
 * (with maker/taker leg awareness), and opt-in CLOB V2 quadratic category rates.
 */

import { DEFAULT_FEE_GAS_PROFILES } from '../sor/fee-gas-model';
import {
  calcMakerFeeRate,
  calcMakerRebateV2,
  calcQuadraticTakerFeeV2,
  calcTakerFeePerShare,
  type PolymarketCategory,
  type PolymarketFeeSchedule,
} from '../polymarket/polymarket-fee-calculator';

/** Venue the backtest ledger prices against. */
export const BACKTEST_VENUE = 'polymarket_clob';

export type BacktestLegOrderType = 'GTC' | 'GTD' | 'FOK' | 'IOC';

export interface VenueCostInput {
  /** Closing fill price per share. */
  price: number;
  /** Shares filled. */
  size: number;
  /** Gross PnL for this close, before any venue cost. */
  grossPnl: number;
  /** Entry leg price per share (defaults to `price`). */
  entryPrice?: number;
  /** Order type of the entry leg; GTC/GTD settle at maker rate/rebate, IOC/FOK/omitted at taker. */
  entryOrderType?: BacktestLegOrderType;
  /** Order type of the closing leg; GTC/GTD settle at maker rate/rebate, IOC/FOK/omitted at taker. */
  exitOrderType?: BacktestLegOrderType;
  /** Live parabolic fee schedule resolved for this market/token (`null` = exempt). */
  schedule?: PolymarketFeeSchedule | null;
  /** Opt-in Polymarket CLOB V2 market category for quadratic fee / maker rebate calculation. */
  clobV2Category?: PolymarketCategory;
  /** When true under CLOB V2, treats both legs as passive `postOnly` maker orders. */
  postOnly?: boolean;
}

export interface VenueCostBreakdown {
  /** Trading fee charged on this close (negative when maker schedule rebate exceeds taker cost). */
  feeUsd: number;
  /** Fixed gas charged on this close. */
  gasUsd: number;
  /** Explicit CLOB V2 maker rebate earned on this close (`0` unless `clobV2Category` + `postOnly`). */
  rebateUsd: number;
  /** feeUsd + gasUsd. */
  totalCostUsd: number;
  /** grossPnl - totalCostUsd + rebateUsd. */
  netPnl: number;
}

function isMakerOrderType(orderType?: BacktestLegOrderType): boolean {
  return orderType === 'GTC' || orderType === 'GTD';
}

function calcLegFeePerShare(
  legPrice: number,
  orderType: BacktestLegOrderType | undefined,
  schedule: PolymarketFeeSchedule | null | undefined,
  makerFeeBps: number,
  takerFeeBps: number,
): number {
  if (schedule === null) return 0;
  if (isMakerOrderType(orderType)) {
    if (schedule !== undefined) {
      return schedule.takerOnly
        ? calcMakerFeeRate(schedule, legPrice) * legPrice
        : calcTakerFeePerShare(schedule, legPrice);
    }
    return legPrice * (makerFeeBps / 10000);
  }
  if (schedule !== undefined) {
    return calcTakerFeePerShare(schedule, legPrice);
  }
  return legPrice * (takerFeeBps / 10000);
}

/**
 * Subtract taker fees and gas (and credit maker rebates) from one closing fill.
 */
export function applyVenueCosts(
  {
    price,
    size,
    grossPnl,
    entryPrice,
    entryOrderType,
    exitOrderType,
    schedule,
    clobV2Category,
    postOnly,
  }: VenueCostInput,
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
    const resolvedEntryPrice =
      schedule !== undefined || isMakerOrderType(entryOrderType) ? (entryPrice ?? price) : price;
    const entryFeePerShare = calcLegFeePerShare(
      resolvedEntryPrice,
      entryOrderType,
      schedule,
      profile.makerFeeBps,
      profile.takerFeeBps,
    );
    const exitFeePerShare = calcLegFeePerShare(
      price,
      exitOrderType,
      schedule,
      profile.makerFeeBps,
      profile.takerFeeBps,
    );
    feeUsd = (entryFeePerShare + exitFeePerShare) * size;
  }

  const gasUsd = profile.gasCostUsd * gasFills;
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
