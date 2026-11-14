/**
 * Places the two legs of a cash-collateralised pair quote.
 *
 * Kept apart from the strategy so the ordering guarantee is visible in one
 * place: YES is sent first, and NO is only sent once YES is confirmed. A
 * strategy that posts NO first can be left holding a naked directional leg when
 * the YES side fails, which is the exact risk the pair is meant to remove.
 *
 * This module only places orders and reports what filled; the caller owns the
 * position list and the trade event, so there is one writer for each.
 */

import type { ClobClient, RawOrderBook } from '../../../polymarket/clob-client';
import type { OrderManager } from '../../../polymarket/order-manager';
import type { StrategyName } from '../../../core/types';
import { logger } from '../../../core/logger';
import type { PairQuote, ToxicityAwareConfig } from './toxicity-aware-market-maker-types';
import { bestBidPrice, capQuoteSize, sizeAtLevel } from './toxicity-aware-market-maker-math';

/** One leg that the venue confirmed as filled. */
export interface ExecutedLeg {
  tokenId: string;
  conditionId: string;
  side: 'yes' | 'no';
  price: number;
  quantity: number;
  fees: string | undefined;
  orderId: string;
  atMs: number;
}

export interface LegExecutorOptions {
  clob: ClobClient;
  orderManager: OrderManager;
  strategyName: StrategyName;
  config: ToxicityAwareConfig;
  onFill: (leg: ExecutedLeg) => void;
}

export class PairLegExecutor {
  constructor(private readonly opts: LegExecutorOptions) {}

  /** Post YES, then NO at the same share count. No-op when either leg's book gives no size. */
  async postPair(quote: PairQuote, nowMs: number): Promise<void> {
    const [yesBook, noBook] = await Promise.all([
      this.bookFor(quote.tokenId),
      this.bookFor(quote.noTokenId),
    ]);
    const yesDisplayed =
      sizeAtLevel(yesBook.bids, quote.yesBidPrice) ||
      sizeAtLevel(yesBook.bids, bestBidPrice(yesBook.bids));
    const noDisplayed =
      sizeAtLevel(noBook.bids, quote.noBidPrice) ||
      sizeAtLevel(noBook.bids, bestBidPrice(noBook.bids));
    const requested = Math.min(
      Math.floor(quote.yesNotionalPusd / quote.yesBidPrice),
      Math.floor(quote.noNotionalPusd / quote.noBidPrice),
    );
    const shares = capQuoteSize(
      requested,
      Math.min(yesDisplayed, noDisplayed),
      this.opts.config.skuCapShares,
    );
    if (!(shares > 0)) return;

    const yesFilled = await this.placeLeg(quote, 'yes', quote.yesBidPrice, shares, nowMs);
    if (!yesFilled) return;
    await this.placeLeg(quote, 'no', quote.noBidPrice, shares, nowMs);
  }

  /** A failed fetch is an empty book, never a synthesised one. */
  private async bookFor(tokenId: string): Promise<RawOrderBook> {
    try {
      return await this.opts.clob.getOrderBook(tokenId);
    } catch (err) {
      logger.debug('Book unavailable at quote time', this.opts.strategyName, { tokenId, err: String(err) });
      return { bids: [], asks: [], timestamp: Date.now() };
    }
  }

  private async placeLeg(
    quote: PairQuote,
    side: 'yes' | 'no',
    price: number,
    shares: number,
    nowMs: number,
  ): Promise<boolean> {
    const tokenId = side === 'yes' ? quote.tokenId : quote.noTokenId;
    if (!tokenId || !(price > 0)) return false;

    // `OrderManager.placeOrder` cannot express post-only, so the resting intent
    // is carried by the order type: GTC/GTD never cross at a quoted touch.
    let order: Awaited<ReturnType<OrderManager['placeOrder']>>;
    try {
      order = await this.opts.orderManager.placeOrder({
        tokenId,
        side: 'buy',
        price: price.toFixed(4),
        size: String(shares),
        orderType: this.opts.config.quoteOrderType,
      });
    } catch (err) {
      logger.warn('Quote leg rejected', this.opts.strategyName, { tokenId, side, err: String(err) });
      return false;
    }

    // `filled === undefined` means the venue has not confirmed; the base class
    // treats that as filled, and this strategy does not change that contract.
    if (order.filled === false) {
      logger.debug('Quote leg resting, no fill confirmed', this.opts.strategyName, { tokenId, orderId: order.id });
      return false;
    }

    const price2 = order.fillPrice !== undefined ? parseFloat(order.fillPrice) : price;
    const quantity = order.filledSize !== undefined ? parseFloat(order.filledSize) : shares;
    if (!(quantity > 0) || !(price2 > 0)) return false;

    this.opts.onFill({
      tokenId,
      conditionId: quote.conditionId,
      side,
      price: price2,
      quantity,
      fees: order.fees,
      orderId: order.id,
      atMs: nowMs,
    });
    return true;
  }
}
