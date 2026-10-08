/**
 * Multi-Level Order Flow Imbalance (OFI) Engine
 * Implements Cont-Kukanov-Stoikov multi-level order flow tracking with Kyle-Obizhaeva exponential continuous decay kernels.
 *
 * @module desk/alphadynamics/multi-level-ofi-engine
 */

import {
  OrderBookSnapshot,
  MultiLevelOfiResult,
} from './alphadynamics-types';

export class MultiLevelOfiEngine {
  private priorSnapshot: OrderBookSnapshot | null = null;
  private ofiHistory: number[] = [];

  constructor(
    private readonly maxLevels = 5,
    private readonly decayLambda = 0.5, // Kyle-Obizhaeva continuous kernel decay
    private readonly zScoreWindow = 50
  ) {}

  /**
   * Updates order flow imbalance with incoming order book snapshot.
   */
  public processSnapshot(current: OrderBookSnapshot): MultiLevelOfiResult {
    if (!this.priorSnapshot) {
      this.priorSnapshot = current;
      return {
        symbol: current.symbol,
        timestampMs: current.timestampMs,
        levelOfi: new Array(this.maxLevels).fill(0),
        integratedOfi: 0,
        decayWeightedOfi: 0,
        normalizedOfiZScore: 0,
      };
    }

    const prev = this.priorSnapshot;
    const levelOfi: number[] = [];

    const numLevels = Math.min(
      this.maxLevels,
      current.bids.length,
      current.asks.length,
      prev.bids.length,
      prev.asks.length
    );

    for (let m = 0; m < numLevels; m++) {
      const curBid = current.bids[m]!;
      const prevBid = prev.bids[m]!;
      const curAsk = current.asks[m]!;
      const prevAsk = prev.asks[m]!;

      // Bid OFI component
      let bidFlow = 0;
      if (curBid.price > prevBid.price) {
        bidFlow = curBid.size;
      } else if (curBid.price === prevBid.price) {
        bidFlow = curBid.size - prevBid.size;
      } else {
        bidFlow = -prevBid.size;
      }

      // Ask OFI component
      let askFlow = 0;
      if (curAsk.price < prevAsk.price) {
        askFlow = curAsk.size;
      } else if (curAsk.price === prevAsk.price) {
        askFlow = curAsk.size - prevAsk.size;
      } else {
        askFlow = -prevAsk.size;
      }

      // OFI at level m = Bid Flow - Ask Flow
      levelOfi.push(bidFlow - askFlow);
    }

    // Integrated OFI (unweighted sum)
    const integratedOfi = levelOfi.reduce((acc, val) => acc + val, 0);

    // Decay-weighted OFI (continuous kernel: exp(-lambda * level))
    let decayWeightedOfi = 0;
    for (let m = 0; m < levelOfi.length; m++) {
      const weight = Math.exp(-this.decayLambda * m);
      decayWeightedOfi += (levelOfi[m] ?? 0) * weight;
    }

    this.ofiHistory.push(decayWeightedOfi);
    if (this.ofiHistory.length > this.zScoreWindow) {
      this.ofiHistory.shift();
    }

    const normalizedOfiZScore = this.computeZScore(decayWeightedOfi);

    this.priorSnapshot = current;

    return {
      symbol: current.symbol,
      timestampMs: current.timestampMs,
      levelOfi,
      integratedOfi: Number(integratedOfi.toFixed(2)),
      decayWeightedOfi: Number(decayWeightedOfi.toFixed(4)),
      normalizedOfiZScore: Number(normalizedOfiZScore.toFixed(4)),
    };
  }

  private computeZScore(value: number): number {
    if (this.ofiHistory.length < 2) return 0;
    const mean = this.ofiHistory.reduce((a, b) => a + b, 0) / this.ofiHistory.length;
    const variance = this.ofiHistory.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / (this.ofiHistory.length - 1);
    const stdDev = Math.sqrt(variance);
    if (stdDev === 0) return 0;
    return (value - mean) / stdDev;
  }
}
