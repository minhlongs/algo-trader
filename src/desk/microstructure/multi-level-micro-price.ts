/**
 * Multi-Level Order Book Micro-Price & Queue Imbalance Estimator
 * Models fair value micro-price incorporating depth weights and order queue depletion probabilities.
 *
 * @module desk/microstructure/multi-level-micro-price
 */

import { MicroPriceEstimate, MultiLevelOrderBook } from './microstructure-types';

export class MultiLevelMicroPriceEstimator {
  public estimateMicroPrice(book: MultiLevelOrderBook): MicroPriceEstimate | undefined {
    const bestBid = book.bids[0];
    const bestAsk = book.asks[0];
    if (!bestBid || !bestAsk || bestBid.price >= bestAsk.price) return undefined;

    const midPrice = (bestBid.price + bestAsk.price) / 2;
    const spread = bestAsk.price - bestBid.price;
    const spreadBps = (spread / midPrice) * 10000;

    // L1 queue imbalance: (BidQty - AskQty) / (BidQty + AskQty)
    const totalL1 = bestBid.size + bestAsk.size;
    const queueImbalance = totalL1 > 0 ? (bestBid.size - bestAsk.size) / totalL1 : 0;

    // Multi-level volume weighting with exponential level decay
    let sumWeightPrice = 0;
    let sumWeights = 0;
    const maxLevels = Math.min(book.bids.length, book.asks.length, 5);

    for (let i = 0; i < maxLevels; i++) {
      const bid = book.bids[i];
      const ask = book.asks[i];
      if (!bid || !ask) continue;

      const decay = Math.exp(-i * 0.5);
      const levelWeight = (bid.size + ask.size) * decay;
      const levelMid = (bid.price + ask.price) / 2;

      sumWeightPrice += levelMid * levelWeight;
      sumWeights += levelWeight;
    }

    const volumeWeightedMidQuote = sumWeights > 0 ? sumWeightPrice / sumWeights : midPrice;
    // Micro-price adjustment: Mid + Imbalance * (Spread / 2)
    const microPrice = midPrice + queueImbalance * (spread / 2);

    return {
      midPrice: Number(midPrice.toFixed(4)),
      microPrice: Number(microPrice.toFixed(4)),
      queueImbalance: Number(queueImbalance.toFixed(4)),
      spreadBps: Number(spreadBps.toFixed(2)),
      volumeWeightedMidQuote: Number(volumeWeightedMidQuote.toFixed(4)),
    };
  }
}
