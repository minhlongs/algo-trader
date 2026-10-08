/**
 * Roll Implicit Effective Bid-Ask Spread Estimator
 * Derives effective spread from serial return autocovariance (Roll, 1984: Spread = 2 * sqrt(-cov)).
 *
 * @module desk/microstructure/roll-spread-estimator
 */

import { RollSpreadEstimate } from './microstructure-types';

export class RollSpreadEstimator {
  private readonly priceDifferences: number[] = [];
  private lastPrice: number | undefined;

  public ingestPrice(price: number): void {
    if (this.lastPrice !== undefined) {
      const diff = price - this.lastPrice;
      this.priceDifferences.push(diff);
    }
    this.lastPrice = price;
  }

  public estimateSpread(symbol: string): RollSpreadEstimate {
    const n = this.priceDifferences.length;
    if (n < 2) {
      return { symbol, sampleCount: n, autocovariance: 0, effectiveSpread: 0, effectiveSpreadBps: 0 };
    }

    let sumLaggedProduct = 0;
    for (let i = 1; i < n; i++) {
      const prev = this.priceDifferences[i - 1] ?? 0;
      const curr = this.priceDifferences[i] ?? 0;
      sumLaggedProduct += prev * curr;
    }

    const autocovariance = sumLaggedProduct / (n - 1);
    // Roll formula: 2 * sqrt(-autocovariance) if autocovariance < 0, else 0
    const effectiveSpread = autocovariance < 0 ? 2 * Math.sqrt(-autocovariance) : 0;
    const currentPrice = this.lastPrice ?? 1;
    const effectiveSpreadBps = (effectiveSpread / currentPrice) * 10000;

    return {
      symbol,
      sampleCount: n,
      autocovariance: Number(autocovariance.toFixed(6)),
      effectiveSpread: Number(effectiveSpread.toFixed(4)),
      effectiveSpreadBps: Number(effectiveSpreadBps.toFixed(2)),
    };
  }
}
