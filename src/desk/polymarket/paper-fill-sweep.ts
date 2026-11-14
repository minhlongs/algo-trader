/**
 * Paper Fill Sweep — how a paper order fills against real CLOB depth
 *
 * Two paths, because the venue fills them for different reasons:
 *
 *   - marketable order  -> taker crossing the spread, sweeps displayed depth,
 *                          waits the venue's matching delay, pays the taker fee
 *   - resting order     -> maker joining the back of the queue at the limit
 *                          price, subject to cancel volume and cancel latency,
 *                          earns the market's maker rebate
 *
 * Fees come from a `PolymarketFeeSchedule`. There is no category keyword here:
 * the caller resolves the schedule for the token and passes it in.
 */

import type { PolymarketOrderBook } from '../execution/polymarket-adapter';
import { calcMakerFeeRate, calcTakerFeeRate, type PolymarketFeeSchedule } from './polymarket-fee-calculator';
import { isMarketable, LEVEL_PRICE_EPSILON, parseLevels } from './orderbook-levels';
import {
  buildQueueModel, estimateMakerQueue, simulateMakerFill, takerMatchDelayMsForTier,
  type FillBookLevel, type RandomSource,
} from './queue-aware-fill-simulator';

/**
 * Fallback schedule when PAPER mode runs with no market lookup configured so an
 * immediate paper fill still carries a non-zero fee until `FeeScheduleResolver`
 * supplies the market's published curve (0.04–0.07 live mid-band).
 */
export const DEFAULT_PAPER_FEE_SCHEDULE: PolymarketFeeSchedule = Object.freeze({
  exponent: 1,
  rate: 0.05,
  takerOnly: true,
  rebateRate: 0.15,
}) as PolymarketFeeSchedule;

/** How the orchestrator obtains real depth for a token in paper mode. */
export type PaperOrderBookProvider = (
  tokenId: string,
) => Promise<{ bids: FillBookLevel[]; asks: FillBookLevel[] } | PolymarketOrderBook>;

/** How long the visible size at the touch is assumed to take to turn over once. */
export const TOUCH_TURNOVER_MS = 1000;

export interface PaperSweepOutcome {
  status: 'matched' | 'unmatched';
  lifecycleType: 'FILLED' | 'PARTIALLY_FILLED' | 'REJECTED';
  requestedSize: number;
  limitPrice: number;
  filledSize: number;
  avgFillPrice: number;
  /** Positive is a charge to us, negative is the market's maker rebate credit. */
  feeUsdc: number;
  partial: boolean;
  /** Which side of the book we ended up on, and therefore which fee applied. */
  liquidityRole: 'taker' | 'maker';
  /** Venue matching delay applied before the fill is final, in milliseconds. */
  matchDelayMs: number;
  /** Set when the order was rejected by the resting path rather than by an empty book. */
  rejectReason?: string;
}

export interface SweepOrderParams {
  book: { bids: FillBookLevel[]; asks: FillBookLevel[] } | null;
  side: 'BUY' | 'SELL';
  requestedSize: number;
  limitPrice: number;
  /** The market's published schedule — resolved by token id, never by category. */
  schedule: PolymarketFeeSchedule;
  /** Crypto-tier contracts pay the venue's taker matching delay. */
  contractTier?: 'crypto' | 'standard';
  /** Seeded stream for the queue draws, so a replay fills identically. */
  rng?: RandomSource;
  /** Override the aggressive arrival rate used by the maker queue model. */
  aggressiveVolumePerMs?: number;
  /** Venue time-in-force: IOC/FOK never rest on the book, and FOK rejects partial sweeps. */
  orderType?: 'GTC' | 'GTD' | 'FOK' | 'IOC';
}

function rejectSweep(
  requestedSize: number,
  limitPrice: number,
  liquidityRole: 'taker' | 'maker',
  rejectReason?: string,
): PaperSweepOutcome {
  return {
    status: 'unmatched', lifecycleType: 'REJECTED', requestedSize, limitPrice,
    filledSize: 0, avgFillPrice: 0, feeUsdc: 0, partial: false,
    liquidityRole, matchDelayMs: 0, ...(rejectReason ? { rejectReason } : {}),
  };
}

export function sweepOrderBookLevels(params: SweepOrderParams): PaperSweepOutcome {
  const { book, side, requestedSize, limitPrice, schedule, orderType } = params;
  const matchDelayMs = takerMatchDelayMsForTier(params.contractTier ?? 'standard');

  if (!book) {
    return {
      status: 'matched', lifecycleType: 'FILLED', requestedSize, limitPrice,
      filledSize: requestedSize, avgFillPrice: limitPrice,
      feeUsdc: calcTakerFeeRate(schedule, limitPrice) * requestedSize * limitPrice,
      partial: false, liquidityRole: 'taker', matchDelayMs,
    };
  }

  const opposite = parseLevels(side === 'BUY' ? (book.asks ?? []) : (book.bids ?? []));
  if (!isMarketable(opposite, side, limitPrice)) {
    if (orderType === 'IOC' || orderType === 'FOK') {
      return rejectSweep(requestedSize, limitPrice, 'taker', `${orderType} order not marketable`);
    }
    return fillRestingQueue(params);
  }

  const parsed = opposite.sort((a, b) => (side === 'BUY' ? a.price - b.price : b.price - a.price));
  let remaining = requestedSize;
  let filledSize = 0;
  let totalNotional = 0;

  for (const lvl of parsed) {
    const crosses = side === 'BUY'
      ? lvl.price <= limitPrice + LEVEL_PRICE_EPSILON
      : lvl.price >= limitPrice - LEVEL_PRICE_EPSILON;
    if (!crosses) break;
    const take = Math.min(remaining, lvl.size);
    if (take <= 0) continue;
    filledSize += take;
    totalNotional += take * lvl.price;
    remaining -= take;
    if (remaining <= LEVEL_PRICE_EPSILON) break;
  }

  if (filledSize <= LEVEL_PRICE_EPSILON) return rejectSweep(requestedSize, limitPrice, 'taker');

  const avgFillPrice = totalNotional / filledSize;
  const partial = filledSize < requestedSize - LEVEL_PRICE_EPSILON;
  if (partial && orderType === 'FOK') {
    return rejectSweep(requestedSize, limitPrice, 'taker', 'FOK order insufficient depth for full fill');
  }
  return {
    status: 'matched', lifecycleType: partial ? 'PARTIALLY_FILLED' : 'FILLED',
    requestedSize, limitPrice, filledSize, avgFillPrice,
    feeUsdc: calcTakerFeeRate(schedule, avgFillPrice) * filledSize * avgFillPrice,
    partial, liquidityRole: 'taker', matchDelayMs,
  };
}

/** Resting-order path: join back of queue at limit price, or front of queue when improving a two-sided spread. */
function fillRestingQueue(params: SweepOrderParams): PaperSweepOutcome {
  const { book, side, requestedSize, limitPrice, schedule } = params;
  const ourSide = parseLevels(side === 'BUY' ? (book?.bids ?? []) : (book?.asks ?? []));
  const opposite = parseLevels(side === 'BUY' ? (book?.asks ?? []) : (book?.bids ?? []));
  const model = buildQueueModel({
    ...(params.contractTier === undefined ? {} : { tier: params.contractTier }),
    ...(params.rng === undefined ? {} : { rng: params.rng }),
  });
  const queue = estimateMakerQueue({
    levels: ourSide.map((lvl) => ({ price: String(lvl.price), size: String(lvl.size) })),
    limitPrice, cancelVolumeFraction: model.cancelVolumeFraction, cancelLatencyMs: model.cancelLatencyMs,
  });

  if (queue.queueAheadSize <= LEVEL_PRICE_EPSILON) {
    const bestOur = side === 'BUY'
      ? ourSide.reduce((m, l) => Math.max(m, l.price), -Infinity)
      : ourSide.reduce((m, l) => Math.min(m, l.price), Infinity);
    const improvesSpread = opposite.length > 0 && ourSide.length > 0 && (
      side === 'BUY' ? limitPrice > bestOur + LEVEL_PRICE_EPSILON : limitPrice < bestOur - LEVEL_PRICE_EPSILON
    );
    if (!improvesSpread) {
      return rejectSweep(requestedSize, limitPrice, 'maker', 'no resting liquidity at the limit price');
    }
  }

  const bestOpp = opposite.length === 0
    ? null
    : side === 'BUY'
      ? opposite.reduce((m, l) => Math.min(m, l.price), Infinity)
      : opposite.reduce((m, l) => Math.max(m, l.price), -Infinity);
  const touchSize = bestOpp === null
    ? 0
    : opposite.reduce((s, l) => (Math.abs(l.price - bestOpp) <= LEVEL_PRICE_EPSILON ? s + l.size : s), 0);
  const arrivalRate = params.aggressiveVolumePerMs ?? touchSize / TOUCH_TURNOVER_MS;
  const fill = simulateMakerFill({ ourSize: requestedSize, queue, aggressiveVolumePerMs: arrivalRate });
  if (fill.filledSize <= LEVEL_PRICE_EPSILON) {
    return rejectSweep(requestedSize, limitPrice, 'maker', 'resting order not reached by end of cancel window');
  }

  const partial = fill.filledSize < requestedSize - LEVEL_PRICE_EPSILON;
  return {
    status: 'matched', lifecycleType: partial ? 'PARTIALLY_FILLED' : 'FILLED',
    requestedSize, limitPrice, filledSize: fill.filledSize, avgFillPrice: limitPrice,
    feeUsdc: calcMakerFeeRate(schedule, limitPrice) * fill.filledSize * limitPrice,
    partial, liquidityRole: 'maker', matchDelayMs: 0,
  };
}
