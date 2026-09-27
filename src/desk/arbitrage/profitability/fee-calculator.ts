/**
 * Profitability Fee Calculator
 * Calculates dynamic exchange taker/maker fees and Polymarket dynamic probability fees.
 */

import {
  calcTakerFee,
  calcMakerRebate,
  classifyMarketCategory,
  FEE_SCHEDULES,
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
    const schedule = FEE_SCHEDULES[category];

    if (schedule.exempt) {
      return { rate: 0, feeUsd: 0 };
    }

    if (leg.orderType === 'maker') {
      const takerRate = calcTakerFee(category, clampedP);
      const rebateRate = takerRate * schedule.makerRebatePct;
      return { rate: -rebateRate, feeUsd: -notionalUsd * rebateRate };
    }

    const takerRate = calcTakerFee(category, clampedP);
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
  const rate = calcTakerFee(category, clampedP);
  const feeUsd = notionalUsd * rate;
  const rebateUsd = calcMakerRebate(category, feeUsd);

  return {
    rate,
    feeUsd,
    rebateUsd,
  };
}
