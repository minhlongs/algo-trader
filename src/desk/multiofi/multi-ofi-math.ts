/**
 * Mathematical kernels for Cont, Kukanov & Stoikov (2014) Multi-Depth OFI.
 * Strictly < 140 LOC, zero external dependencies, zero :any.
 */

import { OrderBookLevel, LevelOfiContribution } from './multi-ofi-types';

export class MultiOfiMath {
  private static readonly EPSILON = 1e-8;

  /**
   * Computes order flow imbalance for a single book level k between time t-1 and t.
   */
  public static computeLevelOfi(
    prevBid: OrderBookLevel | undefined,
    currBid: OrderBookLevel | undefined,
    prevAsk: OrderBookLevel | undefined,
    currAsk: OrderBookLevel | undefined,
    level: number,
    weight: number
  ): LevelOfiContribution {
    const pBidPrev = prevBid?.price ?? 0;
    const qBidPrev = prevBid?.size ?? 0;
    const pBidCurr = currBid?.price ?? 0;
    const qBidCurr = currBid?.size ?? 0;

    let deltaBid = 0;
    if (pBidCurr > pBidPrev + this.EPSILON) {
      deltaBid = qBidCurr;
    } else if (Math.abs(pBidCurr - pBidPrev) <= this.EPSILON) {
      deltaBid = qBidCurr - qBidPrev;
    } else {
      deltaBid = -qBidPrev;
    }

    const pAskPrev = prevAsk?.price ?? 0;
    const qAskPrev = prevAsk?.size ?? 0;
    const pAskCurr = currAsk?.price ?? 0;
    const qAskCurr = currAsk?.size ?? 0;

    let deltaAsk = 0;
    if (pAskCurr < pAskPrev - this.EPSILON) {
      deltaAsk = qAskCurr;
    } else if (Math.abs(pAskCurr - pAskPrev) <= this.EPSILON) {
      deltaAsk = qAskCurr - qAskPrev;
    } else {
      deltaAsk = -qAskPrev;
    }

    const ofi = deltaBid - deltaAsk;

    return {
      level,
      bidFlow: deltaBid,
      askFlow: deltaAsk,
      ofi,
      weight,
    };
  }

  /**
   * Calculates exponential depth decay weights: w_k = exp(-lambda * (k - 1)) / Z
   */
  public static computeDepthWeights(depthK: number, lambda: number): number[] {
    const weights: number[] = [];
    let sum = 0;

    for (let k = 1; k <= depthK; k++) {
      const w = Math.exp(-lambda * (k - 1));
      weights.push(w);
      sum += w;
    }

    return sum > 0 ? weights.map(w => w / sum) : weights.map(() => 1 / depthK);
  }

  /**
   * Calculates midquote from level 1 bid and ask.
   */
  public static computeMidquote(
    bid: OrderBookLevel | undefined,
    ask: OrderBookLevel | undefined
  ): number {
    const b = bid?.price ?? 0;
    const a = ask?.price ?? 0;
    return (b + a) / 2.0;
  }
}
