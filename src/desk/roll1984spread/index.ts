// SPDX-License-Identifier: MIT
/**
 * Wave 339 — Roll (1984) Implicit Effective Bid-Ask Spread Estimator
 * Estimates the effective bid-ask spread s = 2 * sqrt(-Cov(Δp_t, Δp_{t-1}))
 * from first-order serial autocovariance of transaction price changes.
 */

export interface Roll1984SpreadInput {
  readonly tradePrices: readonly number[];
  readonly referenceMidPrice?: number;
}

export interface Roll1984SpreadOutput {
  readonly sampleSize: number;
  readonly serialAutocovariance: number;
  readonly impliedSpreadPriceUnits: number;
  readonly impliedSpreadBps: number;
  readonly bidAskBounceDetected: boolean;
}

export class Roll1984SpreadEngine {
  public estimateImplicitSpread(input: Roll1984SpreadInput): Roll1984SpreadOutput {
    const prices = input.tradePrices;
    if (prices.length < 3) {
      return {
        sampleSize: prices.length,
        serialAutocovariance: 0,
        impliedSpreadPriceUnits: 0,
        impliedSpreadBps: 0,
        bidAskBounceDetected: false,
      };
    }

    const deltas: number[] = [];
    for (let i = 1; i < prices.length; i++) {
      deltas.push(prices[i] - prices[i - 1]);
    }

    const n = deltas.length - 1;
    const meanDelta = deltas.reduce((a, b) => a + b, 0) / deltas.length;
    let covSum = 0;
    for (let t = 1; t < deltas.length; t++) {
      covSum += (deltas[t] - meanDelta) * (deltas[t - 1] - meanDelta);
    }
    const serialAutocovariance = covSum / Math.max(1, n);
    const bidAskBounceDetected = serialAutocovariance < 0;
    const impliedSpreadPriceUnits = bidAskBounceDetected
      ? 2 * Math.sqrt(-serialAutocovariance)
      : 0;

    const refPrice = Math.max(
      1e-6,
      input.referenceMidPrice ?? prices[prices.length - 1],
    );
    const impliedSpreadBps = (impliedSpreadPriceUnits / refPrice) * 10000;

    return {
      sampleSize: prices.length,
      serialAutocovariance: Number(serialAutocovariance.toFixed(8)),
      impliedSpreadPriceUnits: Number(impliedSpreadPriceUnits.toFixed(6)),
      impliedSpreadBps: Number(impliedSpreadBps.toFixed(4)),
      bidAskBounceDetected,
    };
  }
}
