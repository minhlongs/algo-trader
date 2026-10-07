/**
 * Level-3 Order Book Simulation Engine
 * Replays discrete L3 events, maintains bid/ask queues, and produces book snapshots.
 *
 * @module desk/simulation/l3-orderbook-engine
 */

import type {
  L3BookLevel,
  L3BookSnapshot,
  L3ExecutionReport,
  L3MarketEvent,
} from './l3-event-types';
import { L3OrderBookQueue } from './l3-orderbook-queue';

export class L3OrderBookEngine {
  private readonly bids = new Map<number, L3OrderBookQueue>();
  private readonly asks = new Map<number, L3OrderBookQueue>();
  private readonly orderLocations = new Map<string, { side: 'BID' | 'ASK'; price: number }>();
  private currentTimestampNs = 0n;

  public processEvent(event: L3MarketEvent): readonly L3ExecutionReport[] {
    this.currentTimestampNs = event.timestampNs;
    switch (event.action) {
      case 'ADD':
        return this.handleAdd(event);
      case 'CANCEL':
        this.handleCancel(event.orderId);
        return [];
      case 'MODIFY':
        this.handleModify(event);
        return [];
      case 'EXECUTE':
        return this.handleExecute(event);
      default:
        return [];
    }
  }

  public getSnapshot(depth: number = 10): L3BookSnapshot {
    const sortedBids = Array.from(this.bids.entries())
      .filter(([, q]) => q.totalSize > 0)
      .sort(([p1], [p2]) => p2 - p1)
      .slice(0, depth)
      .map(([price, q]): L3BookLevel => ({
        price,
        totalSize: q.totalSize,
        orderCount: q.orderCount,
      }));

    const sortedAsks = Array.from(this.asks.entries())
      .filter(([, q]) => q.totalSize > 0)
      .sort(([p1], [p2]) => p1 - p2)
      .slice(0, depth)
      .map(([price, q]): L3BookLevel => ({
        price,
        totalSize: q.totalSize,
        orderCount: q.orderCount,
      }));

    const bestBid = sortedBids[0]?.price;
    const bestAsk = sortedAsks[0]?.price;
    const midPrice = bestBid !== undefined && bestAsk !== undefined
      ? (bestBid + bestAsk) / 2
      : undefined;
    const spread = bestBid !== undefined && bestAsk !== undefined
      ? bestAsk - bestBid
      : undefined;

    return {
      timestampNs: this.currentTimestampNs,
      bids: sortedBids,
      asks: sortedAsks,
      bestBid,
      bestAsk,
      midPrice,
      spread,
    };
  }

  public getVolumeAhead(orderId: string): number {
    const loc = this.orderLocations.get(orderId);
    if (!loc) return -1;
    const book = loc.side === 'BID' ? this.bids : this.asks;
    const queue = book.get(loc.price);
    return queue ? queue.getVolumeAhead(orderId) : -1;
  }

  private handleAdd(event: L3MarketEvent): readonly L3ExecutionReport[] {
    const book = event.side === 'BID' ? this.bids : this.asks;
    let queue = book.get(event.price);
    if (!queue) {
      queue = new L3OrderBookQueue(event.price);
      book.set(event.price, queue);
    }
    queue.addOrder(event.orderId, event.size, event.timestampNs);
    this.orderLocations.set(event.orderId, { side: event.side, price: event.price });
    return [];
  }

  private handleCancel(orderId: string): void {
    const loc = this.orderLocations.get(orderId);
    if (!loc) return;
    const book = loc.side === 'BID' ? this.bids : this.asks;
    const queue = book.get(loc.price);
    if (queue) {
      queue.cancelOrder(orderId);
      if (queue.totalSize === 0) book.delete(loc.price);
    }
    this.orderLocations.delete(orderId);
  }

  private handleModify(event: L3MarketEvent): void {
    const loc = this.orderLocations.get(event.orderId);
    if (!loc) return;
    const newPrice = event.newPrice ?? event.price;
    const newSize = event.newSize ?? event.size;

    if (newPrice !== loc.price) {
      this.handleCancel(event.orderId);
      this.handleAdd({ ...event, price: newPrice, size: newSize, action: 'ADD' });
    } else {
      const book = loc.side === 'BID' ? this.bids : this.asks;
      const queue = book.get(loc.price);
      if (queue) queue.modifyOrder(event.orderId, newSize);
    }
  }

  private handleExecute(event: L3MarketEvent): readonly L3ExecutionReport[] {
    const loc = this.orderLocations.get(event.orderId);
    if (!loc) return [];
    const book = loc.side === 'BID' ? this.bids : this.asks;
    const queue = book.get(loc.price);
    if (!queue) return [];

    const { executed, fullyFilled } = queue.executeFromHead(event.size);
    if (fullyFilled) {
      this.orderLocations.delete(event.orderId);
      if (queue.totalSize === 0) book.delete(loc.price);
    }

    return [{
      matchEventId: `exec-${event.eventId}`,
      passiveOrderId: event.orderId,
      aggressorSide: loc.side === 'BID' ? 'ASK' : 'BID',
      price: loc.price,
      executedSize: executed,
      timestampNs: event.timestampNs,
      remainingSize: queue.totalSize,
    }];
  }
}
