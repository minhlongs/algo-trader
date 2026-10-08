import { Level2OrderBook, OrderFlowImbalanceSignal } from './microstructure-types';

export class OrderFlowImbalanceEngine {
  /**
   * Computes Cont et al. Multi-Level Order Flow Imbalance (OFI) between consecutive L2 snapshots:
   * OFI = delta q_bid - delta q_ask
   */
  public computeOfi(prevBook: Level2OrderBook, currBook: Level2OrderBook): OrderFlowImbalanceSignal {
    if (prevBook.bids.length === 0 || currBook.bids.length === 0) {
      throw new Error('Order book bids must not be empty');
    }
    if (prevBook.asks.length === 0 || currBook.asks.length === 0) {
      throw new Error('Order book asks must not be empty');
    }

    const prevBestBid = prevBook.bids[0]!;
    const currBestBid = currBook.bids[0]!;
    const prevBestAsk = prevBook.asks[0]!;
    const currBestAsk = currBook.asks[0]!;

    // 1. Bid side delta
    let deltaBid = 0;
    if (currBestBid.price > prevBestBid.price) {
      deltaBid = currBestBid.size;
    } else if (currBestBid.price === prevBestBid.price) {
      deltaBid = currBestBid.size - prevBestBid.size;
    } else {
      deltaBid = -prevBestBid.size;
    }

    // 2. Ask side delta
    let deltaAsk = 0;
    if (currBestAsk.price < prevBestAsk.price) {
      deltaAsk = currBestAsk.size;
    } else if (currBestAsk.price === prevBestAsk.price) {
      deltaAsk = currBestAsk.size - prevBestAsk.size;
    } else {
      deltaAsk = -prevBestAsk.size;
    }

    const ofi = deltaBid - deltaAsk;

    // Depth imbalance ratio at best level
    const totalBestSize = currBestBid.size + currBestAsk.size;
    const depthRatio = totalBestSize > 0 ? (currBestBid.size - currBestAsk.size) / totalBestSize : 0;

    // Depletion alert triggered if depth drops by > 75% on either side
    const bidDepleted = currBestBid.size < 0.25 * prevBestBid.size && currBestBid.price <= prevBestBid.price;
    const askDepleted = currBestAsk.size < 0.25 * prevBestAsk.size && currBestAsk.price >= prevBestAsk.price;

    return {
      timestampMs: currBook.timestampMs,
      ofiContracts: ofi,
      bestBidPrice: currBestBid.price,
      bestAskPrice: currBestAsk.price,
      spread: Number((currBestAsk.price - currBestBid.price).toFixed(4)),
      depthImbalanceRatio: Number(depthRatio.toFixed(4)),
      depletionAlert: bidDepleted || askDepleted,
    };
  }
}
