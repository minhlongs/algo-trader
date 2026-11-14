/**
 * The two-stage exit for the news-latency ladder.
 *
 * Once a fill's bid sits in the 0.94–0.97 band, 70% of it is sold at the band
 * floor and the remainder is left to resolution. Selling at the floor rather
 * than the mid means the limit only executes while the book still pays inside
 * the band, so a stale quote can never sell below it.
 *
 * Exactly one recycle per leg: after it runs, `getCustomExitCondition` is what
 * eventually closes the residual, when the resolution window closes.
 */

import type { OpenPosition, TradeEvent } from '../base-polymarket-strategy';
import type { StrategyName } from '../../../core/types';
import type { NewsLatencyBook } from './primary-source-news-latency-state';
import type { NewsLadderExecutor } from './primary-source-news-latency-executor';
import type { PrimarySourceNewsLatencyConfig } from './primary-source-news-latency-types';
import { inRecycleBand, recycleSplit } from './primary-source-news-latency-math';

export interface RecycleContext {
  book: NewsLatencyBook;
  positions: OpenPosition[];
  executor: NewsLadderExecutor;
  config: PrimarySourceNewsLatencyConfig;
  strategyName: StrategyName;
  /** Best bid for a token; 0 when the book cannot be read. */
  getBid: (tokenId: string) => Promise<number>;
  emit: (trade: TradeEvent) => void;
}

/** Walk every owned leg once, recycling any that has reached the band. */
export async function recycleInBand(ctx: RecycleContext, nowMs: number): Promise<void> {
  for (const leg of ctx.book.ownedLegs()) {
    if (leg.recycled) continue;
    const bid = await ctx.getBid(leg.fill.tokenId);
    if (!inRecycleBand(bid, ctx.config.recycleBandLowPusd, ctx.config.recycleBandHighPusd)) continue;
    const { recycleShares } = recycleSplit(leg.fill.quantity, ctx.config.recycleFraction);
    const sale = await ctx.executor.recycle(leg.fill.tokenId, recycleShares);
    if (!sale) continue;
    ctx.book.markRecycled(leg.fill.tokenId);
    shrinkPosition(ctx.positions, leg.fill.tokenId, sale.quantity);
    ctx.emit({
      orderId: sale.orderId,
      marketId: leg.fill.conditionId,
      side: 'sell',
      fillPrice: sale.price.toFixed(4),
      fillSize: (sale.quantity * sale.price).toFixed(2),
      fees: sale.fees ?? '0',
      timestamp: nowMs,
      strategy: ctx.strategyName,
    });
  }
}

/** The base class sells `tokenQuantity` and tracks `sizeUsdc`/`entryFeesUsdc` on the residual. */
function shrinkPosition(positions: OpenPosition[], tokenId: string, soldQuantity: number): void {
  const idx = positions.findIndex((candidate) => candidate.tokenId === tokenId);
  if (idx < 0) return;
  const position = positions[idx]!;
  const prevQty = position.tokenQuantity;
  if (!(prevQty > 0)) {
    positions.splice(idx, 1);
    return;
  }
  const nextQty = prevQty - soldQuantity;
  if (nextQty <= 1e-9) {
    positions.splice(idx, 1);
    return;
  }
  const ratio = nextQty / prevQty;
  position.tokenQuantity = nextQty;
  position.sizeUsdc *= ratio;
  if (position.entryFeesUsdc !== undefined) position.entryFeesUsdc *= ratio;
}