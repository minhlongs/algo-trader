/**
 * Orderbook-Backed Paper Fill Simulator (G2-Poly-Shadow)
 *
 * Public surface for paper fills. The mechanics live in three modules so each
 * stays small enough to read in one sitting:
 *
 *   - `orderbook-levels`     parses CLOB levels and decides marketability
 *   - `paper-fill-sweep`     decides how much fills, and at what price and fee
 *   - `paper-order-application` carries the outcome into the ledger
 *
 * and the Leg-1 -> Leg-2 execution decay statistics live in
 * `paper-leg-decay-tracker`. This file only re-exports them.
 */

export {
  DEFAULT_PAPER_FEE_SCHEDULE,
  TOUCH_TURNOVER_MS,
  sweepOrderBookLevels,
} from './paper-fill-sweep';
export type { PaperOrderBookProvider, PaperSweepOutcome, SweepOrderParams } from './paper-fill-sweep';
export { applyPaperOrderOutcome, extractPaperOrderParams } from './paper-order-application';
export { isMarketable, LEVEL_PRICE_EPSILON, parseLevels } from './orderbook-levels';
export type { ParsedLevel } from './orderbook-levels';
export { PaperLegDecayTracker } from './paper-leg-decay-tracker';
export type { Leg2DecayStats, LegOutcomeSummary } from './paper-leg-decay-tracker';
