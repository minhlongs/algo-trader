/**
 * Profitability Fee Calculator
 * Applies the fee schedule the exchange publishes for each leg's market.
 *
 * There is no category table here. A Polymarket leg carries the schedule its
 * market reports (`VenueTradeLeg.polymarketFeeSchedule`); a leg without one is
 * `unavailable` rather than silently priced from a guessed category.
 */

import {
  calcMakerFeeRate,
  calcTakerFeeRate,
  type PolymarketFeeSchedule,
} from '../../polymarket/polymarket-fee-calculator';
import type { VenueTradeLeg } from './profitability-types';

/** Standard 10 bps charged by the CEX venues this desk routes to. */
const DEFAULT_CEX_FEE_RATE = 0.001;

/**
 * A leg's fee as a fraction of notional, plus the USD amount. `rate` is negative
 * for a maker rebate. `available: false` means the venue did not tell us the
 * schedule, so the leg cannot be priced — callers must reject, never assume 0.
 */
export type LegFee =
  | { available: true; rate: number; feeUsd: number }
  | { available: false; venue: string; symbol: string };

function polymarketLegFee(leg: VenueTradeLeg, notionalUsd: number): LegFee {
  const schedule = leg.polymarketFeeSchedule;
  if (!schedule) {
    return { available: false, venue: leg.venue, symbol: leg.symbol };
  }
  if (schedule.rate <= 0) {
    // Exempt market: the exchange publishes `feesEnabled: false`, which
    // `FeeScheduleResolver` surfaces as a zero-rate schedule.
    return { available: true, rate: 0, feeUsd: 0 };
  }
  const rate =
    leg.orderType === 'maker'
      ? calcMakerFeeRate(schedule, leg.price)
      : calcTakerFeeRate(schedule, leg.price);
  return { available: true, rate, feeUsd: notionalUsd * rate };
}

/**
 * Fee for one leg of a cross-venue trade. `feeOverride` still wins so callers
 * that measured a real fill can pin the exact rate.
 */
export function calculateLegFee(
  leg: VenueTradeLeg,
  notionalUsd: number,
  feeOverride?: number
): LegFee {
  if (feeOverride !== undefined) {
    return { available: true, rate: feeOverride, feeUsd: notionalUsd * feeOverride };
  }
  if (leg.venue.toLowerCase() === 'polymarket') {
    return polymarketLegFee(leg, notionalUsd);
  }
  return { available: true, rate: DEFAULT_CEX_FEE_RATE, feeUsd: notionalUsd * DEFAULT_CEX_FEE_RATE };
}

/**
 * Taker fee, its rate as a fraction of notional, and the maker rebate the same
 * market pays, for `notionalUsd` of exposure at `probability`.
 *
 * The rebate is the taker fee at that price times the market's `rebateRate`,
 * which is what `-notionalUsd * calcMakerFeeRate(...)` reduces to.
 */
export function calculatePolymarketFee(
  schedule: PolymarketFeeSchedule,
  probability: number,
  notionalUsd: number
): { rate: number; feeUsd: number; rebateUsd: number } {
  const rate = calcTakerFeeRate(schedule, probability);
  const feeUsd = notionalUsd * rate;
  const rebateUsd = notionalUsd * -calcMakerFeeRate(schedule, probability);
  return {
    rate,
    feeUsd,
    rebateUsd: Number.isFinite(rebateUsd) && rebateUsd > 0 ? rebateUsd : 0,
  };
}
