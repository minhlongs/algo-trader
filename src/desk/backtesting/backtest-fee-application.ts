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

/** Venue the backtest ledger prices against. */
export const BACKTEST_VENUE = 'polymarket_clob';

export interface VenueCostInput {
  /** Fill price per share. */
  price: number;
  /** Shares filled. */
  size: number;
  /** Gross PnL for this close, before any venue cost. */
  grossPnl: number;
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
 * Both legs carry a taker fee, charged on this close's notional. Gas is fixed
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
export function applyVenueCosts(
  { price, size, grossPnl }: VenueCostInput,
  gasFills = 2,
): VenueCostBreakdown {
  const profile = DEFAULT_FEE_GAS_PROFILES[BACKTEST_VENUE];
  const notionalUsd = price * size;

  const feePerLegUsd = notionalUsd * (profile.takerFeeBps / 10000);
  const feeUsd = feePerLegUsd * 2;

  const gasUsd = profile.gasCostUsd * gasFills;
  const totalCostUsd = feeUsd + gasUsd;

  const netPnl = grossPnl - totalCostUsd;

  return {
    feeUsd: roundUsd(feeUsd),
    gasUsd: roundUsd(gasUsd),
    totalCostUsd: roundUsd(totalCostUsd),
    netPnl: roundUsd(netPnl),
  };
}

/**
 * Round to the cent so the ledger cannot accumulate sub-cent drift across a run.
 */
function roundUsd(value: number): number {
  return Math.round(value * 100) / 100;
}
