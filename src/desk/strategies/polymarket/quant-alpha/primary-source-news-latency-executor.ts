/**
 * Order placement for Primary-Source News-to-Probability Latency.
 *
 * The report sweeps each ladder contract with a fill-and-kill limit order at
 * the ceiling p_max. `OrderManager` has no FAK; `IOC` is the venue enum with
 * the same meaning, so the sweep uses the configured `legOrderType`. Each leg
 * is sized at the ceiling plus its own fee, so walking the book up to p_max can
 * never spend more than that leg's share of the cluster capital.
 *
 * The recycle sale is a limit at the bottom of the band: it only executes
 * while the book still pays inside 0.94–0.97, never below.
 *
 * This module only places orders and reports what filled; the strategy owns
 * the position list and the trade events, so each has one writer.
 */

import type { OrderManager } from '../../../polymarket/order-manager';
import type { StrategyName } from '../../../core/types';
import { logger } from '../../../core/logger';
import type { LadderLeg, NewsFill, PrimarySourceNewsLatencyConfig } from './primary-source-news-latency-types';
import { sharesForLeg } from './primary-source-news-latency-math';

export interface NewsExecutorOptions {
  orderManager: OrderManager;
  strategyName: StrategyName;
  config: PrimarySourceNewsLatencyConfig;
}

export class NewsLadderExecutor {
  constructor(private readonly opts: NewsExecutorOptions) {}

  /** Cross every leg at p_max. Returns only the legs the venue confirmed. */
  async sweep(legs: LadderLeg[], capitalPerLegPusd: number, nowMs: number): Promise<NewsFill[]> {
    const { config } = this.opts;
    const fills: NewsFill[] = [];
    for (const leg of legs) {
      const shares = sharesForLeg(capitalPerLegPusd, config.maxEntryPricePusd, leg.takerFeePerShare);
      if (!(shares > 0)) continue;
      const fill = await this.place(leg.tokenId, 'buy', config.maxEntryPricePusd, shares, config.legOrderType);
      if (fill) fills.push({ ...fill, conditionId: leg.conditionId, outcome: leg.outcome, atMs: nowMs });
    }
    return fills;
  }

  /** Sell `shares` no lower than the band floor. Null when nothing executed. */
  async recycle(tokenId: string, shares: number): Promise<{ price: number; quantity: number; fees?: string; orderId: string } | null> {
    if (!(shares > 0)) return null;
    return this.place(tokenId, 'sell', this.opts.config.recycleBandLowPusd, shares, 'IOC');
  }

  private async place(
    tokenId: string,
    side: 'buy' | 'sell',
    limitPrice: number,
    shares: number,
    orderType: 'IOC' | 'FOK',
  ): Promise<{ tokenId: string; price: number; quantity: number; fees: string | undefined; orderId: string } | null> {
    let order: Awaited<ReturnType<OrderManager['placeOrder']>>;
    try {
      order = await this.opts.orderManager.placeOrder({
        tokenId,
        side,
        price: limitPrice.toFixed(4),
        size: String(shares),
        orderType,
      });
    } catch (err) {
      logger.warn('News ladder order rejected', this.opts.strategyName, { tokenId, side, err: String(err) });
      return null;
    }
    // An IOC that the venue reports unfilled executed nothing.
    if (order.filled === false) return null;
    const price = order.fillPrice !== undefined ? parseFloat(order.fillPrice) : limitPrice;
    const quantity = order.filledSize !== undefined ? parseFloat(order.filledSize) : shares;
    if (!(price > 0) || !(quantity > 0)) return null;
    return { tokenId, price, quantity, fees: order.fees, orderId: order.id };
  }
}
