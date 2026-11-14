/**
 * Backtest Fee Application
 *
 * Single seam where venue trading costs enter the backtest ledger.
 *
 * A backtest that omits fees cannot distinguish "this strategy has an edge" from
 * "this strategy has not paid for its own trades yet". Every closed fill passes
 * through `applyVenueCosts` so the reported PnL is net of what the venue charges.
 *
 * Venue parameters live in `../sor/fee-gas-model` — they are not duplicated here,
 * so a fee change is a one-line change at the venue profile and every backtest
 * picks it up on the next run.
 */

import { DEFAULT_FEE_GAS_PROFILES } from '../sor/fee-gas-model';
import {
  calcMakerFeeRate,
  calcTakerFeePerShare,
  type PolymarketFeeSchedule,
} from '../polymarket/polymarket-fee-calculator';

/** Venue the backtest ledger prices against. */
export const BACKTEST_VENUE = 'polymarket_clob';

export type BacktestLegOrderType = 'GTC' | 'GTD' | 'FOK' | 'IOC';

export interface VenueCostInput {
  /** Fill price per share. */
  price: number;
  /** Shares filled. */
  size: number;
  /** Gross PnL for this close, before any venue cost. */
  grossPnl: number;
  /** Entry leg price per share when `schedule` is supplied (defaults to `price`). */
  entryPrice?: number;
  /** Order type of the entry leg; GTC/GTD settle at maker rate/rebate, IOC/FOK/omitted at taker. */
  entryOrderType?: BacktestLegOrderType;
  /** Order type of the closing leg; GTC/GTD settle at maker rate/rebate, IOC/FOK/omitted at taker. */
  exitOrderType?: BacktestLegOrderType;
  /**
   * Live parabolic fee schedule resolved for this market/token (`null` = exempt).
   * When supplied, entry + exit legs use maker/taker schedule rates per share
   * instead of flat venue bps. Omit to keep the flat venue profile.
   */
  schedule?: PolymarketFeeSchedule | null;
}

export interface VenueCostBreakdown {
  /** Trading fee charged on this close. */
  feeUsd: number;
  /** Fixed gas charged on this close. */
  gasUsd: number;
  /** feeUsd + gasUsd. */
  totalCostUsd: number;
  /** grossPnl - totalCostUsd. */
  netPnl: number;
}

/**
 * Subtract taker fees and gas from one closing fill.
 *
 * Both legs carry a taker fee, charged on this close's notional (or the token's
 * parabolic `PolymarketFeeSchedule` when supplied). Gas is fixed
 * per on-chain fill, and the entry fills are settled on the close that
 * finishes them, so the caller passes how many entry fills this close settles:
 * 1 for the exit fill itself plus one per entry fill when the position is fully
 * closed out. A position scaled out over several sells therefore pays entry gas
 * once, on its final sell, not once per sell.
 *
 * A loss deep enough that costs push PnL below zero stays negative — costs are
 * never netted into a profit, and a fill whose gross PnL is exactly its cost is
 * reported as break-even at 0.
 */
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

export function applyVenueCosts(
  { price, size, grossPnl, entryPrice, entryOrderType, exitOrderType, schedule }: VenueCostInput,
  gasFills = 2,
): VenueCostBreakdown {
  const profile = DEFAULT_FEE_GAS_PROFILES[BACKTEST_VENUE];
  const resolvedEntryPrice = schedule !== undefined || isMakerOrderType(entryOrderType)
    ? (entryPrice ?? price)
    : price;
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
  const feeUsd = (entryFeePerShare + exitFeePerShare) * size;

  const gasUsd = profile.gasCostUsd * gasFills;

  // Round in dependency order, not field by field. Rounding each reported field
  // independently lets a half-cent cost round up in `totalCostUsd` and again in
  // `netPnl`, which breaks the invariant the audit trail depends on:
  // netPnl === grossPnl - (feeUsd + gasUsd) to the cent.
  const feeUsdRounded = roundUsd(feeUsd);
  const gasUsdRounded = roundUsd(gasUsd);
  const totalCostUsd = roundUsd(feeUsdRounded + gasUsdRounded);
  const netPnl = roundUsd(roundUsd(grossPnl) - totalCostUsd);

  return {
    feeUsd: feeUsdRounded,
    gasUsd: gasUsdRounded,
    totalCostUsd,
    netPnl,
  };
}

/**
 * Round to the cent so the ledger cannot accumulate sub-cent drift across a run.
 */
function roundUsd(value: number): number {
  return Math.round(value * 100) / 100;
}
