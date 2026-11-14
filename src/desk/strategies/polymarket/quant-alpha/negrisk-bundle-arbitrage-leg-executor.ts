/**
 * Matches the legs of one NegRisk bundle.
 *
 * Ordering is the whole point of this module, so it lives in one readable
 * place: least liquid leg first, thick legs last, and every leg after the
 * first is shrunk to what the first leg actually filled. Matching the thick
 * legs first would fill the easy side and leave the thin side unbought, which
 * turns an arbitrage into a directional bet.
 *
 * Thin legs are posted (GTC/GTD) because a maker leg pays no taker fee and the
 * report optimises exactly that ratio. Thick legs are matched aggressively
 * (IOC/FOK) with sequential failfast: the first aggressive failure stops the
 * rest, because a partial bundle is worse than no bundle.
 *
 * Each leg re-reads its own book before ordering. A leg whose ask has moved is
 * skipped rather than crossed at the scan-time price — the quote in hand was
 * priced off a book that no longer exists.
 */

import type { ClobClient, RawOrderBook } from '../../../polymarket/clob-client';
import type { OrderManager } from '../../../polymarket/order-manager';
import type { StrategyName } from '../../../core/types';
import { logger } from '../../../core/logger';
import type {
  BundleLeg,
  BundleQuote,
  NegRiskBundleConfig,
} from './negrisk-bundle-arbitrage-types';
import { snapToTick, shrinkToFirstFill, sizeAtLevel, sortLegsByLiquidity } from './negrisk-bundle-arbitrage-math';
import type { BundleBook, BundleFill } from './negrisk-bundle-arbitrage-state';

export interface BundleLegExecutorOptions {
  clob: ClobClient;
  orderManager: OrderManager;
  strategyName: StrategyName;
  config: NegRiskBundleConfig;
  book: BundleBook;
}

export class BundleLegExecutor {
  constructor(private readonly opts: BundleLegExecutorOptions) {}

  /**
   * Place every leg of `quote` in thin-first order.
   *
   * Returns the count of aggressive legs that failed. A resting maker leg is
   * not a failure — it is the intended outcome on a thin book.
   */
  async executeQuote(quote: BundleQuote, nowMs: number): Promise<number> {
    const ordered = sortLegsByLiquidity(quote.legs);
    let firstFill = 0;
    let aggressiveFailures = 0;

    for (const leg of ordered) {
      const aggressive = leg.displayedShares >= this.opts.config.thinLegMaxDisplayedShares;
      const available = await this.crossableShares(leg);
      const shares = this.sharesFor(leg, available, firstFill);

      if (!(shares > 0)) {
        if (!aggressive) break;
        this.opts.book.recordAttempt(quote.eventId, false);
        aggressiveFailures += 1;
        if (this.opts.config.sequentialFailfast) break;
        continue;
      }

      const filledShares = await this.placeLeg(quote.eventId, leg, shares, aggressive, nowMs);
      if (filledShares > 0 && firstFill === 0) firstFill = filledShares;

      // A thin maker leg that rested unfilled means the bundle cannot be
      // exhaustive, so nothing later may be crossed: buying only the thick
      // legs would turn an arbitrage into a directional bet.
      if (!aggressive) {
        if (!(filledShares > 0)) break;
        continue;
      }

      this.opts.book.recordAttempt(quote.eventId, filledShares > 0);
      if (filledShares > 0) continue;
      aggressiveFailures += 1;
      if (this.opts.config.sequentialFailfast) break;
    }

    return aggressiveFailures;
  }

  /** Displayed size at the quoted ask, re-read now. 0 when the ask moved away. */
  private async crossableShares(leg: BundleLeg): Promise<number> {
    const book = await this.readBook(leg.tokenId);
    return sizeAtLevel(book.asks, leg.askPrice);
  }

  /** Requested size, capped by the live book and by the first leg's fill. */
  private sharesFor(leg: BundleLeg, available: number, firstFill: number): number {
    const byNotional = Math.floor(this.opts.config.legNotionalPusd / leg.askPrice);
    const requested = Math.min(byNotional, Math.floor(available));
    if (!(firstFill > 0)) return Math.max(0, requested);
    return shrinkToFirstFill(requested, firstFill, this.opts.config.shrinkToFirstFillRatio);
  }

  /** One order. Returns the filled share count; 0 means nothing was confirmed. */
  private async placeLeg(
    eventId: string,
    leg: BundleLeg,
    shares: number,
    aggressive: boolean,
    nowMs: number,
  ): Promise<number> {
    const orderType = aggressive
      ? this.opts.config.thickLegOrderType
      : this.opts.config.thinLegOrderType;
    const tick = this.opts.config.tickSize;
    const limitPrice = aggressive
      ? leg.askPrice
      : Math.max(tick, snapToTick(leg.askPrice - tick, tick));

    let order: Awaited<ReturnType<OrderManager['placeOrder']>>;
    try {
      order = await this.opts.orderManager.placeOrder({
        tokenId: leg.tokenId,
        side: 'buy',
        price: limitPrice.toFixed(4),
        size: String(shares),
        orderType,
      });
    } catch (err) {
      logger.warn('Bundle leg rejected', this.opts.strategyName, {
        eventId,
        outcome: leg.outcome,
        err: String(err),
      });
      return 0;
    }

    // A resting maker leg is the intended outcome for a thin book; only a
    // missing fill on an aggressive leg counts against the failfast rate.
    if (order.filled === false) {
      logger.debug('Bundle leg resting, no fill confirmed', this.opts.strategyName, {
        eventId,
        outcome: leg.outcome,
        orderId: order.id,
        aggressive,
      });
      return 0;
    }

    const price = order.fillPrice !== undefined ? parseFloat(order.fillPrice) : limitPrice;
    const quantity = order.filledSize !== undefined ? parseFloat(order.filledSize) : shares;
    if (!(quantity > 0) || !(price > 0)) return 0;

    const fill: BundleFill = {
      tokenId: leg.tokenId,
      conditionId: leg.conditionId,
      outcome: leg.outcome,
      price,
      quantity,
      fees: order.fees,
      orderId: order.id,
      atMs: nowMs,
      aggressive,
    };
    this.opts.book.recordFill(eventId, fill);
    return quantity;
  }

  /** A failed fetch is an empty book, never a synthesised one. */
  private async readBook(tokenId: string): Promise<RawOrderBook> {
    try {
      return await this.opts.clob.getOrderBook(tokenId);
    } catch (err) {
      logger.debug('Bundle leg book unavailable', this.opts.strategyName, { tokenId, err: String(err) });
      return { bids: [], asks: [], timestamp: Date.now() };
    }
  }
}
