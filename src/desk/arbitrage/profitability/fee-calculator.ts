/**
 * Profitability Fee Calculator
 *
 * Prices Polymarket legs from either the market's published `polymarketFeeSchedule`
 * (fail-closed primary path) or an explicit CLOB V2 quadratic category / market
 * description. A Polymarket leg with neither is rejected (`available: false`)
 * rather than silently priced from a guessed category.
 */

import {
  calcMakerFeeRate,
  calcQuadraticTakerFeeRateV2,
  calcTakerFeeRate,
  classifyMarketCategory,
  CLOB_V2_QUADRATIC_RATES,
  type PolymarketCategory,
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

function polymarketScheduleLegFee(schedule: PolymarketFeeSchedule, leg: VenueTradeLeg, notionalUsd: number): LegFee {
  if (schedule.rate <= 0) {
    return { available: true, rate: 0, feeUsd: 0 };
  }
  const rate =
    leg.orderType === 'maker'
      ? calcMakerFeeRate(schedule, leg.price)
      : calcTakerFeeRate(schedule, leg.price);
  return { available: true, rate, feeUsd: notionalUsd * rate };
}

function polymarketCategoryLegFee(category: PolymarketCategory, leg: VenueTradeLeg, notionalUsd: number): LegFee {
  const clampedP = Math.min(Math.max(leg.price, 0.001), 0.999);
  const v2 = CLOB_V2_QUADRATIC_RATES[category];
  if (v2.rCat <= 0) {
    return { available: true, rate: 0, feeUsd: 0 };
  }
  const takerRate = calcQuadraticTakerFeeRateV2(category, clampedP);
  if (leg.orderType === 'maker') {
    const rebateRate = takerRate * v2.makerRebatePct;
    return { available: true, rate: -rebateRate, feeUsd: -notionalUsd * rebateRate };
  }
  return { available: true, rate: takerRate, feeUsd: notionalUsd * takerRate };
}

/**
 * Fee for one leg of a cross-venue trade. `feeOverride` wins when supplied.
 */
export function calculateLegFee(
  leg: VenueTradeLeg,
  notionalUsd: number,
  feeOverride?: number,
): LegFee {
  if (feeOverride !== undefined) {
    return { available: true, rate: feeOverride, feeUsd: notionalUsd * feeOverride };
  }
  if (leg.venue.toLowerCase() === 'polymarket') {
    if (leg.polymarketFeeSchedule) {
      return polymarketScheduleLegFee(leg.polymarketFeeSchedule, leg, notionalUsd);
    }
    if (leg.polymarketCategory !== undefined || (leg.marketDescription !== undefined && leg.marketDescription.trim().length > 0)) {
      const category = leg.polymarketCategory ?? classifyMarketCategory(leg.marketDescription!);
      return polymarketCategoryLegFee(category, leg, notionalUsd);
    }
    return { available: false, venue: leg.venue, symbol: leg.symbol };
  }
  return { available: true, rate: DEFAULT_CEX_FEE_RATE, feeUsd: notionalUsd * DEFAULT_CEX_FEE_RATE };
}

/**
 * Taker fee, its rate, and the maker rebate for `notionalUsd` (or share count on
 * the CLOB V2 quadratic curve when passed a `PolymarketCategory`) at `probability`.
 */
export function calculatePolymarketFee(
  scheduleOrCategory: PolymarketFeeSchedule | PolymarketCategory,
  probability: number,
  notionalUsd: number,
): { rate: number; feeUsd: number; rebateUsd: number } {
  if (typeof scheduleOrCategory === 'string') {
    if (!Number.isFinite(probability) || !Number.isFinite(notionalUsd)) {
      return { rate: 0, feeUsd: 0, rebateUsd: 0 };
    }
    const clampedP = Math.min(Math.max(probability, 0.001), 0.999);
    const rate = calcQuadraticTakerFeeRateV2(scheduleOrCategory, clampedP);
    const feeUsd = notionalUsd * rate;
    const rebateUsd = feeUsd * CLOB_V2_QUADRATIC_RATES[scheduleOrCategory].makerRebatePct;
    return {
      rate,
      feeUsd,
      rebateUsd: Number.isFinite(rebateUsd) && rebateUsd > 0 ? rebateUsd : 0,
    };
  }
  const rate = calcTakerFeeRate(scheduleOrCategory, probability);
  const feeUsd = notionalUsd * rate;
  const rebateUsd = notionalUsd * -calcMakerFeeRate(scheduleOrCategory, probability);
  return {
    rate,
    feeUsd,
    rebateUsd: Number.isFinite(rebateUsd) && rebateUsd > 0 ? rebateUsd : 0,
  };
}
