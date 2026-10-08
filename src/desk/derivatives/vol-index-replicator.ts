/**
 * Model-Free Implied Volatility & VIX-Style Replicator
 * Replicates log-contracts across discrete out-of-the-money option strips to compute expected variance.
 * Implements the standard CBOE VIX methodology.
 *
 * @module desk/derivatives/vol-index-replicator
 */

import { VixStripParameters, VixStripResult } from './derivatives-types';

export class VolIndexReplicator {
  /**
   * Calculates the model-free implied volatility index from an option chain.
   * sigma^2 = (2 / T) * sum( (Delta K_i / K_i^2) * e^(RT) * Q(K_i) ) - (1 / T) * (F / K_0 - 1)^2
   */
  public computeVixIndex(params: VixStripParameters): VixStripResult {
    const { timeToExpiryYears, riskFreeRate, forwardPrice, quotes } = params;

    if (timeToExpiryYears <= 0 || forwardPrice <= 0 || quotes.length < 2) {
      throw new Error('Invalid VIX strip parameters: insufficient strikes or non-positive expiry/price');
    }

    // Sort strikes ascending
    const sorted = [...quotes].sort((a, b) => a.strike - b.strike);

    // Identify ATM strike K_0 (first strike <= forwardPrice)
    let atmStrike = sorted[0]?.strike ?? forwardPrice;
    for (const q of sorted) {
      if (q.strike <= forwardPrice) {
        atmStrike = q.strike;
      } else {
        break;
      }
    }

    const expRT = Math.exp(riskFreeRate * timeToExpiryYears);
    let stripSum = 0;

    for (let i = 0; i < sorted.length; i++) {
      const q = sorted[i];
      if (!q) continue;

      // Determine delta K
      let deltaK: number;
      if (i === 0) {
        deltaK = (sorted[1]?.strike ?? q.strike) - q.strike;
      } else if (i === sorted.length - 1) {
        deltaK = q.strike - (sorted[i - 1]?.strike ?? q.strike);
      } else {
        const next = sorted[i + 1]?.strike ?? q.strike;
        const prev = sorted[i - 1]?.strike ?? q.strike;
        deltaK = (next - prev) / 2;
      }

      // Determine out-of-the-money midpoint quote Q(K_i)
      let midPrice: number;
      if (q.strike < atmStrike) {
        // Out-of-the-money put
        midPrice = (q.putBid + q.putAsk) / 2;
      } else if (q.strike > atmStrike) {
        // Out-of-the-money call
        midPrice = (q.callBid + q.callAsk) / 2;
      } else {
        // ATM: average of call and put midpoints
        const callMid = (q.callBid + q.callAsk) / 2;
        const putMid = (q.putBid + q.putAsk) / 2;
        midPrice = (callMid + putMid) / 2;
      }

      const strikeSq = q.strike * q.strike;
      stripSum += (deltaK / strikeSq) * expRT * midPrice;
    }

    const term1 = (2 / timeToExpiryYears) * stripSum;
    const term2 = (1 / timeToExpiryYears) * Math.pow(forwardPrice / atmStrike - 1, 2);
    const varianceRate = Math.max(0, term1 - term2);
    const vixIndexValue = Number((Math.sqrt(varianceRate) * 100).toFixed(2));

    return {
      vixIndexValue,
      forwardPrice,
      atmStrike,
      varianceRate: Number(varianceRate.toFixed(6)),
    };
  }
}
