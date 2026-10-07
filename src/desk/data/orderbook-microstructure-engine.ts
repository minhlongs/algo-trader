/**
 * Order Book Microstructure Engine
 *
 * Implements Level-1 Order Flow Imbalance (OFI), volume-weighted micro-price,
 * and Volume-Synchronized Probability of Toxicity (VPIN).
 *
 * @module desk/data/orderbook-microstructure-engine
 */

import { EventEmitter } from 'events';
import type {
  MicrostructureQuote,
  MicrostructureMetrics,
  MicrostructureConfig,
} from './orderbook-microstructure-types';

export class OrderBookMicrostructureEngine extends EventEmitter {
  private readonly vpinBucketVolume: number;
  private readonly vpinNumBuckets: number;
  private readonly toxicityThreshold: number;
  private readonly ofiWindowSize: number;

  private prevQuotes = new Map<string, MicrostructureQuote>();
  private ofiHistories = new Map<string, number[]>();
  private currentBuckets = new Map<string, { buyVol: number; sellVol: number }>();
  private completedBuckets = new Map<string, Array<{ buyVol: number; sellVol: number }>>();

  constructor(config: MicrostructureConfig = {}) {
    super();
    this.vpinBucketVolume = config.vpinBucketVolume ?? 500;
    this.vpinNumBuckets = config.vpinNumBuckets ?? 10;
    this.toxicityThreshold = config.toxicityThreshold ?? 0.65;
    this.ofiWindowSize = config.ofiWindowSize ?? 20;
  }

  public processQuote(marketId: string, quote: MicrostructureQuote): MicrostructureMetrics {
    const midPrice = (quote.bidPrice + quote.askPrice) / 2;
    const totalSize = quote.bidSize + quote.askSize;
    const microPrice =
      totalSize > 0
        ? (quote.bidPrice * quote.askSize + quote.askPrice * quote.bidSize) / totalSize
        : midPrice;

    const prev = this.prevQuotes.get(marketId);
    let ofi = 0;

    if (prev) {
      const deltaBid =
        quote.bidPrice > prev.bidPrice
          ? quote.bidSize
          : quote.bidPrice === prev.bidPrice
          ? quote.bidSize - prev.bidSize
          : -prev.bidSize;

      const deltaAsk =
        quote.askPrice < prev.askPrice
          ? quote.askSize
          : quote.askPrice === prev.askPrice
          ? quote.askSize - prev.askSize
          : -prev.askSize;

      ofi = deltaBid - deltaAsk;
      this.accumulateVpin(marketId, quote, prev);
    }

    this.prevQuotes.set(marketId, quote);

    const history = this.ofiHistories.get(marketId) ?? [];
    history.push(ofi);
    if (history.length > this.ofiWindowSize) history.shift();
    this.ofiHistories.set(marketId, history);

    const rollingOfi = history.reduce((s, v) => s + v, 0) / history.length;
    const vpinToxicity = this.calculateVpin(marketId);
    const isAdverseSelectionRisk = vpinToxicity >= this.toxicityThreshold;

    const metrics: MicrostructureMetrics = {
      marketId,
      timestamp: quote.timestamp,
      midPrice,
      microPrice,
      spread: quote.askPrice - quote.bidPrice,
      orderFlowImbalance: ofi,
      rollingOfi,
      vpinToxicity,
      isAdverseSelectionRisk,
    };

    if (isAdverseSelectionRisk) {
      this.emit('adverseSelectionWarning', metrics);
    }

    return metrics;
  }

  private accumulateVpin(
    marketId: string,
    current: MicrostructureQuote,
    prev: MicrostructureQuote
  ): void {
    const deltaMid = (current.bidPrice + current.askPrice) / 2 - (prev.bidPrice + prev.askPrice) / 2;
    const estVolume = Math.abs(current.bidSize - prev.bidSize) + Math.abs(current.askSize - prev.askSize);
    if (estVolume <= 0) return;

    const bucket = this.currentBuckets.get(marketId) ?? { buyVol: 0, sellVol: 0 };
    if (deltaMid >= 0) bucket.buyVol += estVolume;
    else bucket.sellVol += estVolume;

    if (bucket.buyVol + bucket.sellVol >= this.vpinBucketVolume) {
      const list = this.completedBuckets.get(marketId) ?? [];
      list.push({ ...bucket });
      if (list.length > this.vpinNumBuckets) list.shift();
      this.completedBuckets.set(marketId, list);
      bucket.buyVol = 0;
      bucket.sellVol = 0;
    }
    this.currentBuckets.set(marketId, bucket);
  }

  private calculateVpin(marketId: string): number {
    const buckets = this.completedBuckets.get(marketId);
    if (!buckets || buckets.length < 3) return 0;

    let totalImbalance = 0;
    let totalVolume = 0;
    for (const b of buckets) {
      totalImbalance += Math.abs(b.buyVol - b.sellVol);
      totalVolume += b.buyVol + b.sellVol;
    }

    return totalVolume > 0 ? Math.min(1.0, totalImbalance / totalVolume) : 0;
  }
}
