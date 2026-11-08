/**
 * Profitability Fee Calculator
 * Calculates dynamic exchange taker/maker fees and Polymarket dynamic probability fees.
 */

import {
  calcQuadraticTakerFeeRateV2,
  classifyMarketCategory,
  CLOB_V2_QUADRATIC_RATES,
  type PolymarketCategory,
} from '../../polymarket/polymarket-fee-calculator';
import type { VenueTradeLeg } from './profitability-types';

export function calculateLegFee(
  leg: VenueTradeLeg,
  notionalUsd: number,
  feeOverride?: number
): { rate: number; feeUsd: number } {
  if (feeOverride !== undefined) {
    return { rate: feeOverride, feeUsd: notionalUsd * feeOverride };
  }

  const venue = leg.venue.toLowerCase();
  if (venue === 'polymarket') {
    const category: PolymarketCategory =
      leg.polymarketCategory ??
      (leg.marketDescription ? classifyMarketCategory(leg.marketDescription) : 'crypto');

    const clampedP = Math.min(Math.max(leg.price, 0.001), 0.999);
    const schedule = CLOB_V2_QUADRATIC_RATES[category];

    if (schedule.rCat <= 0) {
      return { rate: 0, feeUsd: 0 };
    }

    const takerRate = calcQuadraticTakerFeeRateV2(category, clampedP);

    if (leg.orderType === 'maker') {
      // A passive maker pays no taker fee and earns back a share of the taker
      // fees it causes, so the leg reports as a credit.
      const rebateRate = takerRate * schedule.makerRebatePct;
      return { rate: -rebateRate, feeUsd: -notionalUsd * rebateRate };
    }

    return { rate: takerRate, feeUsd: notionalUsd * takerRate };
  }

  // Default CEX venues (Binance, Bybit, KuCoin) standard 10 bps (0.10%)
  const defaultCexRate = 0.001;
  return { rate: defaultCexRate, feeUsd: notionalUsd * defaultCexRate };
}

export function calculatePolymarketFee(
  category: PolymarketCategory,
  probability: number,
  notionalUsd: number
): { rate: number; feeUsd: number; rebateUsd: number } {
  const clampedP = Math.min(Math.max(probability, 0.001), 0.999);
  const rate = calcQuadraticTakerFeeRateV2(category, clampedP);
  const feeUsd = notionalUsd * rate;
  const rebateUsd = feeUsd * CLOB_V2_QUADRATIC_RATES[category].makerRebatePct;

  return {
    rate,
    feeUsd,
    rebateUsd,
  };
}
