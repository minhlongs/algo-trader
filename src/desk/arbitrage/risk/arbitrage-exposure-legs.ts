/**
 * Arbitrage Exposure Leg Helpers
 *
 * Shared leg-normalization for open-exposure bookkeeping. Both opening and
 * closing a basket must group legs the same way, so the aggregation lives here
 * once instead of being repeated with an inverted sign.
 */

import type { ArbitrageBasketLeg } from './risk-types-basket';
import type { MultiLegArbitrageBasket } from './arbitrage-risk-types';

/** Notional actually carried by a leg (explicit value wins, else amount × price). */
export function legNotionalUsd(leg: ArbitrageBasketLeg): number {
  return leg.notionalUsd ?? leg.amount * leg.price;
}

/** True when a leg's notional is a usable positive number. */
export function isCountableNotional(notional: number): boolean {
  return Number.isFinite(notional) && notional > 0;
}

/** Per-venue notional contribution of a basket's legs (skipping unusable legs). */
export function venueNotionals(basket: MultiLegArbitrageBasket): Map<string, number> {
  const perVenue = new Map<string, number>();
  for (const leg of basket.legs) {
    const notional = legNotionalUsd(leg);
    if (!isCountableNotional(notional)) continue;
    perVenue.set(leg.venue, (perVenue.get(leg.venue) ?? 0) + notional);
  }
  return perVenue;
}

/**
 * Per-symbol notional contribution of a basket's legs.
 *
 * Takes the max leg per symbol rather than the sum: a basket's legs on the same
 * symbol are two sides of one position, so summing them would double count.
 */
export function symbolMaxNotionals(basket: MultiLegArbitrageBasket): Map<string, number> {
  const perSymbol = new Map<string, number>();
  for (const leg of basket.legs) {
    const notional = legNotionalUsd(leg);
    if (!isCountableNotional(notional)) continue;
    const curr = perSymbol.get(leg.symbol) ?? 0;
    perSymbol.set(leg.symbol, Math.max(curr, notional));
  }
  return perSymbol;
}
