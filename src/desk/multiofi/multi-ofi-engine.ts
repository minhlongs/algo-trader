/**
 * Cont, Kukanov & Stoikov (2014) Multi-Depth Order Flow Imbalance (OFI) Engine.
 * Integrates queue changes across K orderbook depths to predict price movements.
 * Strictly < 150 LOC, zero :any.
 */

import {
  OrderBookSnapshot,
  MultiOfiConfig,
  MultiOfiResult,
  LevelOfiContribution,
} from './multi-ofi-types';
import { MultiOfiMath } from './multi-ofi-math';

export class MultiOfiEngine {
  private readonly config: MultiOfiConfig;
  private readonly depthWeights: number[];
  private lastSnapshot?: OrderBookSnapshot;

  constructor(config?: Partial<MultiOfiConfig>) {
    this.config = {
      depthLevels: config?.depthLevels ?? 5,
      decayLambda: config?.decayLambda ?? 0.4,
    };
    this.depthWeights = MultiOfiMath.computeDepthWeights(
      this.config.depthLevels,
      this.config.decayLambda
    );
  }

  /**
   * Processes a sequence of order book snapshots, returning OFI results.
   */
  public processSequence(snapshots: readonly OrderBookSnapshot[]): MultiOfiResult[] {
    const results: MultiOfiResult[] = [];
    this.lastSnapshot = undefined;

    for (const snap of snapshots) {
      const res = this.update(snap);
      if (res) {
        results.push(res);
      }
    }

    return results;
  }

  /**
   * Updates engine with a new snapshot and computes OFI relative to prior state.
   */
  public update(snapshot: OrderBookSnapshot): MultiOfiResult | null {
    if (!this.lastSnapshot) {
      this.lastSnapshot = snapshot;
      return null;
    }

    const prev = this.lastSnapshot;
    const K = this.config.depthLevels;
    const contributions: LevelOfiContribution[] = [];
    let integratedOfi = 0;

    for (let k = 1; k <= K; k++) {
      const prevBid = prev.bids[k - 1];
      const currBid = snapshot.bids[k - 1];
      const prevAsk = prev.asks[k - 1];
      const currAsk = snapshot.asks[k - 1];
      const weight = this.depthWeights[k - 1] ?? 0;

      const contrib = MultiOfiMath.computeLevelOfi(
        prevBid,
        currBid,
        prevAsk,
        currAsk,
        k,
        weight
      );

      contributions.push(contrib);
      integratedOfi += contrib.ofi * weight;
    }

    const prevMid = MultiOfiMath.computeMidquote(prev.bids[0], prev.asks[0]);
    const currMid = MultiOfiMath.computeMidquote(snapshot.bids[0], snapshot.asks[0]);
    const midChange = currMid - prevMid;

    // Linear price impact sensitivity approximation: delta P ~= beta * OFI
    // Standard baseline price impact parameter: 0.5 ticks per 100 units OFI
    const betaSensitivity = 0.005;
    const predictedImpact = integratedOfi * betaSensitivity;

    this.lastSnapshot = snapshot;

    return {
      timestamp: snapshot.timestamp,
      depthK: K,
      levelContributions: contributions,
      integratedOfi: Number(integratedOfi.toFixed(4)),
      midquoteChange: Number(midChange.toFixed(6)),
      predictedPriceImpact: Number(predictedImpact.toFixed(6)),
    };
  }
}
