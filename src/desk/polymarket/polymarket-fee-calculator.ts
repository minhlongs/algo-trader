/**
 * Polymarket fee arithmetic, driven by the schedule the exchange publishes.
 *
 * The CLOB publishes a per-market `feeSchedule` object on the Gamma API:
 *
 *     { "exponent": 1, "rate": 0.07, "takerOnly": true, "rebateRate": 0.20 }
 *
 * The taker fee for one share at price `p` is `rate * (p * (1 - p)) ^ exponent`,
 * which peaks at p = 0.50 and falls to zero at both extremes. There is no
 * category table and no probability interpolation: read the schedule from the
 * market, then apply this arithmetic.
 */

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
 * e.g. Geopolitics markets). Every function here returns 0 for it, so callers
 * never need to branch on `null` once a market has been resolved.
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
 * Taker fee in USDC **per share** at `price`.
 *
 * `rate * (p * (1 - p)) ^ exponent`. At the live crypto rate of 0.07 and
 * p = 0.50 this is 0.0175 USDC/share (1.75 cents), not a fraction of notional.
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
 * times the market's `rebateRate`. Returns 0 for taker-only schedules with no
 * rebate and for exempt markets.
 */
export function calcMakerRebatePerShare(schedule: PolymarketFeeSchedule, price: number): number {
  if (schedule.rebateRate <= 0) return 0;
  return calcTakerFeePerShare(schedule, price) * schedule.rebateRate;
}

/**
 * Effective maker fee rate as a fraction of notional. Negative — a rebate — and
 * the sign convention the arbitrage profitability chain already uses.
 */
export function calcMakerFeeRate(schedule: PolymarketFeeSchedule, price: number): number {
  const p = clampPrice(price);
  if (p <= 0) return 0;
  const rebate = calcMakerRebatePerShare(schedule, price);
  // Normalise the no-rebate case: `-0` would compare unequal to `0` and read as
  // a credit of zero rather than no credit at all.
  if (!(rebate > 0)) return 0;
  return -rebate / p;
}

/**
 * Fee as a fraction of notional for one taker share at `price`, i.e. the fee
 * divided by the USDC paid per share. This is the rate the arbitrage chain
 * reports in `breakdown.buyFeeRate`.
 */
export function calcTakerFeeRate(schedule: PolymarketFeeSchedule, price: number): number {
  const p = clampPrice(price);
  if (p <= 0) return 0;
  return calcTakerFeePerShare(schedule, price) / p;
}
