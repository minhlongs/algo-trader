/**
 * Midpoint & Block Order Crossing Engine
 * Matches un-displayed dark pool orders against midpoint NBBO prices with strict size thresholding.
 *
 * @module desk/darkpool/crossing-engine
 */

import { CrossingMatch, DarkOrder } from './darkpool-types';

export class CrossingEngine {
  private readonly buyOrders: DarkOrder[] = [];
  private readonly sellOrders: DarkOrder[] = [];
  private readonly maxActiveOrders: number;

  public constructor(maxActiveOrders: number = 10000) {
    this.maxActiveOrders = maxActiveOrders;
  }

  public submitOrder(order: DarkOrder): boolean {
    if (this.buyOrders.length + this.sellOrders.length >= this.maxActiveOrders) {
      return false;
    }
    if (order.side === 'BUY') {
      this.buyOrders.push(order);
    } else {
      this.sellOrders.push(order);
    }
    return true;
  }

  public executeCross(symbol: string, nbboBid: number, nbboAsk: number, currentTimestampMs: number): CrossingMatch[] {
    const midpoint = Number(((nbboBid + nbboAsk) / 2).toFixed(4));
    const matches: CrossingMatch[] = [];

    const activeBuys = this.buyOrders.filter((b) => b.symbol === symbol && (!b.limitPrice || b.limitPrice >= midpoint));
    const activeSells = this.sellOrders.filter((s) => s.symbol === symbol && (!s.limitPrice || s.limitPrice <= midpoint));

    for (let i = 0; i < activeBuys.length; i++) {
      const buy = activeBuys[i];
      if (!buy || buy.quantity <= 0) continue;

      for (let j = 0; j < activeSells.length; j++) {
        const sell = activeSells[j];
        if (!sell || sell.quantity <= 0) continue;

        const fillQty = Math.min(buy.quantity, sell.quantity);
        const buyMinMet = !buy.minExecutionQuantity || fillQty >= buy.minExecutionQuantity;
        const sellMinMet = !sell.minExecutionQuantity || fillQty >= sell.minExecutionQuantity;

        if (buyMinMet && sellMinMet) {
          matches.push({
            matchId: `match-${buy.orderId}-${sell.orderId}`,
            symbol,
            buyOrderId: buy.orderId,
            sellOrderId: sell.orderId,
            matchedQuantity: fillQty,
            executionPrice: midpoint,
            timestampMs: currentTimestampMs,
          });

          // Mutate remaining quantities in place
          (buy as { quantity: number }).quantity -= fillQty;
          (sell as { quantity: number }).quantity -= fillQty;

          if (buy.quantity <= 0) break;
        }
      }
    }

    // Prune fully filled orders from storage
    this.pruneFilledOrders();

    return matches;
  }

  private pruneFilledOrders(): void {
    let bIdx = this.buyOrders.length;
    while (bIdx--) {
      const buy = this.buyOrders[bIdx];
      if (buy && buy.quantity <= 0) {
        this.buyOrders.splice(bIdx, 1);
      }
    }
    let sIdx = this.sellOrders.length;
    while (sIdx--) {
      const sell = this.sellOrders[sIdx];
      if (sell && sell.quantity <= 0) {
        this.sellOrders.splice(sIdx, 1);
      }
    }
  }

  public getActiveOrderCount(): number {
    return this.buyOrders.length + this.sellOrders.length;
  }
}
