/**
 * Paper OrderBook Simulator & Paired Leg-2 Fill-Decay Tracker
 *
 * Barrel + dual-signature `sweepOrderBookLevels` bridge supporting both:
 *  - Quant Alpha truth-machinery `SweepOrderParams` (`{ book, side, requestedSize, limitPrice, orderType, restingAgeMs, schedule }`)
 *  - CLOB V2 positional callers (`(book, side, requestedSize, limitPrice, category?)`)
 */

import {
  DEFAULT_PAPER_FEE_SCHEDULE,
  TOUCH_TURNOVER_MS,
  sweepOrderBookLevels as sweepOrderBookLevelsBySchedule,
  type PaperOrderBookProvider,
  type PaperSweepOutcome,
  type SweepOrderParams,
} from './paper-fill-sweep';
import {
  DEFAULT_CLOB_V2_CATEGORY,
  calcQuadraticTakerFeeRateV2,
  type PolymarketCategory,
} from './polymarket-fee-calculator';

export { DEFAULT_PAPER_FEE_SCHEDULE, TOUCH_TURNOVER_MS };
export type { PaperOrderBookProvider, PaperSweepOutcome, SweepOrderParams };
export { applyPaperOrderOutcome, extractPaperOrderParams } from './paper-order-application';
export { isMarketable, LEVEL_PRICE_EPSILON, parseLevels } from './orderbook-levels';
export type { ParsedLevel } from './orderbook-levels';
export { PaperLegDecayTracker } from './paper-leg-decay-tracker';
export type { Leg2DecayStats, LegOutcomeSummary } from './paper-leg-decay-tracker';

type RawPaperBook = {
  bids: Array<{ price: string; size: string }>;
  asks: Array<{ price: string; size: string }>;
};

export function sweepOrderBookLevels(params: SweepOrderParams): PaperSweepOutcome;
export function sweepOrderBookLevels(
  book: RawPaperBook | null,
  side: 'BUY' | 'SELL',
  requestedSize: number,
  limitPrice: number,
  category?: PolymarketCategory,
): PaperSweepOutcome;
export function sweepOrderBookLevels(
  bookOrParams: SweepOrderParams | RawPaperBook | null,
  side?: 'BUY' | 'SELL',
  requestedSize?: number,
  limitPrice?: number,
  category: PolymarketCategory = DEFAULT_CLOB_V2_CATEGORY,
): PaperSweepOutcome {
  if (bookOrParams !== null && typeof bookOrParams === 'object' && 'side' in bookOrParams) {
    return sweepOrderBookLevelsBySchedule(bookOrParams);
  }
  const book = bookOrParams;
  const resolvedSide = side ?? 'BUY';
  const reqSize = requestedSize ?? 0;
  const limPrice = limitPrice ?? 0.5;

  if (!book) {
    const feeUsdc = calcQuadraticTakerFeeRateV2(category, limPrice) * reqSize * limPrice;
    return {
      status: 'matched',
      lifecycleType: 'FILLED',
      requestedSize: reqSize,
      limitPrice: limPrice,
      filledSize: reqSize,
      avgFillPrice: limPrice,
      feeUsdc,
      partial: false,
      liquidityRole: 'taker',
      matchDelayMs: 0,
    };
  }

  const rawLevels = resolvedSide === 'BUY' ? (book.asks ?? []) : (book.bids ?? []);
  const parsed = rawLevels
    .map((lvl) => ({ price: parseFloat(lvl.price), size: parseFloat(lvl.size) }))
    .filter((lvl) => Number.isFinite(lvl.price) && Number.isFinite(lvl.size) && lvl.size > 0)
    .sort((a, b) => (resolvedSide === 'BUY' ? a.price - b.price : b.price - a.price));

  let remaining = reqSize;
  let filledSize = 0;
  let totalNotional = 0;
  for (const lvl of parsed) {
    const crosses = resolvedSide === 'BUY' ? lvl.price <= limPrice + 1e-9 : lvl.price >= limPrice - 1e-9;
    if (!crosses) break;
    const take = Math.min(remaining, lvl.size);
    if (take <= 0) continue;
    filledSize += take;
    totalNotional += take * lvl.price;
    remaining -= take;
    if (remaining <= 1e-9) break;
  }

  if (filledSize <= 1e-9) {
    return {
      status: 'unmatched',
      lifecycleType: 'REJECTED',
      requestedSize: reqSize,
      limitPrice: limPrice,
      filledSize: 0,
      avgFillPrice: 0,
      feeUsdc: 0,
      partial: false,
      liquidityRole: 'taker',
      matchDelayMs: 0,
    };
  }

  const avgFillPrice = totalNotional / filledSize;
  const feeUsdc = calcQuadraticTakerFeeRateV2(category, avgFillPrice) * filledSize * avgFillPrice;
  const partial = filledSize < reqSize - 1e-9;
  return {
    status: 'matched',
    lifecycleType: partial ? 'PARTIALLY_FILLED' : 'FILLED',
    requestedSize: reqSize,
    limitPrice: limPrice,
    filledSize,
    avgFillPrice,
    feeUsdc,
    partial,
    liquidityRole: 'taker',
    matchDelayMs: 0,
  };
}
