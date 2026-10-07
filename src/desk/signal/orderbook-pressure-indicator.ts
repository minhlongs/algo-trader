import type {
  BookSnapshotForPressure,
  ImbalanceRegime,
  OrderBookPressureMetrics,
} from './orderbook-pressure-types';

export class OrderBookPressureIndicator {
  private readonly depthLevels: number;
  private readonly levelDecayFactor: number;

  public constructor(depthLevels: number = 5, levelDecayFactor: number = 0.5) {
    this.depthLevels = depthLevels;
    this.levelDecayFactor = levelDecayFactor;
  }

  public calculatePressure(snapshot: BookSnapshotForPressure): OrderBookPressureMetrics {
    const { marketId, bids, asks } = snapshot;
    const sortedBids = [...bids].sort((a, b) => b.price - a.price);
    const sortedAsks = [...asks].sort((a, b) => a.price - b.price);

    const bestBid = sortedBids[0];
    const bestAsk = sortedAsks[0];

    const bestBidPrice = bestBid?.price ?? 0;
    const bestAskPrice = bestAsk?.price ?? 1;
    const midPrice = (bestBidPrice + bestAskPrice) / 2;

    const topBidQty = bestBid?.quantity ?? 0;
    const topAskQty = bestAsk?.quantity ?? 0;
    const topTotal = topBidQty + topAskQty;
    const topLevelImbalance = topTotal > 0 ? (topBidQty - topAskQty) / topTotal : 0;

    // Micro-price calculation: P_micro = (V_bid * P_ask + V_ask * P_bid) / (V_bid + V_ask)
    const microPrice = topTotal > 0
      ? (topBidQty * bestAskPrice + topAskQty * bestBidPrice) / topTotal
      : midPrice;

    // Multi-level decay weighted imbalance
    let weightedBidVol = 0;
    let weightedAskVol = 0;
    const maxK = Math.min(this.depthLevels, Math.max(sortedBids.length, sortedAsks.length));

    for (let k = 0; k < maxK; k++) {
      const weight = Math.pow(this.levelDecayFactor, k);
      if (sortedBids[k]) weightedBidVol += sortedBids[k]!.quantity * weight;
      if (sortedAsks[k]) weightedAskVol += sortedAsks[k]!.quantity * weight;
    }

    const multiTotal = weightedBidVol + weightedAskVol;
    const multiLevelImbalance = multiTotal > 0 ? (weightedBidVol - weightedAskVol) / multiTotal : 0;

    let regime: ImbalanceRegime = 'BALANCED';
    if (multiLevelImbalance > 0.5) regime = 'STRONG_BID_PRESSURE';
    else if (multiLevelImbalance > 0.2) regime = 'MILD_BID_PRESSURE';
    else if (multiLevelImbalance < -0.5) regime = 'STRONG_ASK_PRESSURE';
    else if (multiLevelImbalance < -0.2) regime = 'MILD_ASK_PRESSURE';

    const expectedTickDriftBps = Math.round(multiLevelImbalance * 25 * 100) / 100;

    return {
      marketId,
      microPrice: Math.round(microPrice * 10000) / 10000,
      midPrice: Math.round(midPrice * 10000) / 10000,
      topLevelImbalance: Math.round(topLevelImbalance * 1000) / 1000,
      multiLevelImbalance: Math.round(multiLevelImbalance * 1000) / 1000,
      regime,
      expectedTickDriftBps,
    };
  }
}
