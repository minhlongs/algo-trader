/**
 * Pure maths for the NegRisk bundle arbitrage. No imports, no I/O, no clock.
 *
 * The projection solver lives in `negrisk-bundle-arbitrage-solver` and is
 * re-exported here, so callers keep one import surface while each file stays
 * inside the repository's size ceiling.
 */

export * from './negrisk-bundle-arbitrage-solver';

/** A price/size pair shaped like the venue's L2 level, kept structural. */
export interface PriceSizeLevel {
  price: string;
  size: string;
}

/** Round to the market tick, half-up, avoiding float drift on the boundary. */
export function snapToTick(price: number, tickSize: number): number {
  if (!(tickSize > 0) || !Number.isFinite(price)) return 0;
  const steps = Math.round(price / tickSize + 1e-9);
  return Number((steps * tickSize).toFixed(10));
}

/** Best ask, snapped to the tick. 0 when the side is empty — never a guess. */
export function bestAskPrice(levels: PriceSizeLevel[], tickSize: number): number {
  let best = 0;
  for (const level of levels) {
    const price = parseFloat(level.price);
    if (!(price > 0)) continue;
    if (best === 0 || price < best) best = price;
  }
  return best === 0 ? 0 : snapToTick(best, tickSize);
}

/** Size resting exactly at `price`. A leg can only cross what is displayed. */
export function sizeAtLevel(levels: PriceSizeLevel[], price: number): number {
  let total = 0;
  for (const level of levels) {
    if (Math.abs(parseFloat(level.price) - price) > 1e-9) continue;
    const size = parseFloat(level.size);
    if (size > 0) total += size;
  }
  return total;
}

/** Least liquid leg first: the thinnest book is the one that sets the size. */
export function sortLegsByLiquidity<T extends { displayedShares: number }>(legs: T[]): T[] {
  return [...legs].sort((left, right) => left.displayedShares - right.displayedShares);
}

/** Sum of the leg asks — one bundle share costs this much before fees. */
export function totalAskCost(legs: Array<{ askPrice: number }>): number {
  let total = 0;
  for (const leg of legs) total += leg.askPrice;
  return total;
}

/** Net edge per bundle share: redemption 1.00 minus everything paid to get it. */
export function bundleNetEdge(totalCost: number, takerFees: number, vaultFee: number): number {
  return 1 - totalCost - takerFees - vaultFee;
}

/** Shrink a later leg to what the first leg actually filled, times a ratio. */
export function shrinkToFirstFill(requested: number, firstFill: number, ratio: number): number {
  const cap = Math.floor(firstFill * ratio + 1e-9);
  return Math.max(0, Math.min(Math.floor(requested + 1e-9), cap));
}

/** Share of aggressive legs that failed, over the legs attempted. */
export function failfastErrorRate(failures: number, attempts: number): number {
  if (!(attempts > 0)) return 0;
  return failures / attempts;
}

/** The report's cluster kill: too many failfast errors means the event moved. */
export function shouldKillCluster(rate: number, maxRate: number): boolean {
  return rate > maxRate;
}

/** The report optimises the maker-leg ratio only inside the 0.04–0.059 band. */
export function makerOptimisationApplies(rate: number, minRate: number, maxRate: number): boolean {
  return rate >= minRate - 1e-9 && rate <= maxRate + 1e-9;
}

/** Capital must sit inside the report's per-event envelope to be sized at all. */
export function capitalWithinEnvelope(capital: number, minCapital: number, maxCapital: number): boolean {
  return capital >= minCapital && capital <= maxCapital;
}
