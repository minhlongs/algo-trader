/**
 * Polymarket fee arithmetic, supporting both Gamma-published `PolymarketFeeSchedule`
 * objects (per-market parabolic curves resolved by token id) and CLOB V2 quadratic
 * category rates re-exported from the execution layer.
 */

export * from './polymarket-clob-v2-fee-categories';
export * from '../execution/polymarket-clob-v2-fee-math';

export interface PolymarketFeeSchedule {
  /** Curve exponent the exchange applies. Live value: 1 (linear in p*(1-p)). */
  exponent: number;
  /** Base rate the exchange applies. Live values: 0.07, 0.05, 0.04, 0.03. */
  rate: number;
  /** True when only taker fills are charged. Live value: true. */
  takerOnly: boolean;
  /** Fraction of collected taker fees returned to makers. Live: 0.15, 0.20, 0.25. */
  rebateRate: number;
}

/**
 * Schedule for markets the exchange does NOT charge (`feesEnabled: false`,
 * fee-exempt markets). Every function here returns 0 for it.
 */
export const EXEMPT_FEE_SCHEDULE: PolymarketFeeSchedule = Object.freeze({
  exponent: 1,
  rate: 0,
  takerOnly: true,
  rebateRate: 0,
}) as PolymarketFeeSchedule;

/** Clamp a probability into the open interval the exchange prices on. */
function clampPrice(price: number): number {
  if (!Number.isFinite(price)) return 0;
  if (price <= 0) return 0;
  if (price >= 1) return 1;
  return price;
}

/**
 * Taker fee in USDC **per share** at `price`: `rate * (p * (1 - p)) ^ exponent`.
 */
export function calcTakerFeePerShare(schedule: PolymarketFeeSchedule, price: number): number {
  const p = clampPrice(price);
  if (schedule.rate <= 0) return 0;
  const curve = Math.pow(p * (1 - p), schedule.exponent);
  if (!Number.isFinite(curve) || curve <= 0) return 0;
  return schedule.rate * curve;
}

/**
 * Maker rebate in USDC **per share** at `price`: the taker fee at that price
 * times the market's `rebateRate`.
 */
export function calcMakerRebatePerShare(schedule: PolymarketFeeSchedule, price: number): number {
  if (schedule.rebateRate <= 0) return 0;
  return calcTakerFeePerShare(schedule, price) * schedule.rebateRate;
}

/**
 * Effective maker fee rate as a fraction of notional (negative for a rebate).
 */
export function calcMakerFeeRate(schedule: PolymarketFeeSchedule, price: number): number {
  const p = clampPrice(price);
  if (p <= 0) return 0;
  const rebate = calcMakerRebatePerShare(schedule, price);
  if (!(rebate > 0)) return 0;
  return -rebate / p;
}

/**
 * Fee as a fraction of notional for one taker share at `price`.
 */
export function calcTakerFeeRate(schedule: PolymarketFeeSchedule, price: number): number {
  const p = clampPrice(price);
  if (p <= 0) return 0;
  return calcTakerFeePerShare(schedule, price) / p;
}
