import { MarketTradePoint, RollSpreadResult } from './roll-amihud-types';

export class RollEstimator {
  public static calculateRollSpread(trades: MarketTradePoint[]): RollSpreadResult {
    if (trades.length < 3) {
      throw new Error('At least 3 price points required to calculate serial autocovariance');
    }

    const priceDiffs: number[] = [];
    let avgPrice = 0;
    for (let i = 0; i < trades.length; i++) {
      avgPrice += trades[i]!.price;
      if (i > 0) {
        priceDiffs.push(trades[i]!.price - trades[i - 1]!.price);
      }
    }
    avgPrice /= trades.length;

    if (priceDiffs.length < 2) {
      throw new Error('Insufficient price differences to evaluate lag-1 covariance');
    }

    // Mean of diffs
    let meanDiff = 0;
    for (let i = 0; i < priceDiffs.length; i++) {
      meanDiff += priceDiffs[i]!;
    }
    meanDiff /= priceDiffs.length;

    // Lag-1 autocovariance: Cov(Delta P_t, Delta P_{t-1})
    let covSum = 0;
    const n = priceDiffs.length - 1;
    for (let i = 0; i < n; i++) {
      covSum += (priceDiffs[i + 1]! - meanDiff) * (priceDiffs[i]! - meanDiff);
    }
    const autocovariance = covSum / n;

    // Roll formula: Spread s = 2 * sqrt(-Cov) if Cov < 0, else 0
    let effectiveSpread = 0.0;
    let rollModifiedSpread = 0.0;
    const hasNegative = autocovariance < 0;

    if (hasNegative) {
      effectiveSpread = 2.0 * Math.sqrt(-autocovariance);
      rollModifiedSpread = effectiveSpread;
    } else {
      // Roll (1984) non-negative covariance adjustment: s = -2 * sqrt(Cov) or zero proxy
      effectiveSpread = 0.0;
      rollModifiedSpread = 2.0 * Math.sqrt(autocovariance); // modified proxy
    }

    const effectiveSpreadPct = avgPrice > 0 ? (effectiveSpread / avgPrice) * 100.0 : 0.0;

    return {
      autocovariance: Number(autocovariance.toFixed(6)),
      effectiveSpread: Number(effectiveSpread.toFixed(4)),
      effectiveSpreadPct: Number(effectiveSpreadPct.toFixed(4)),
      hasNegativeAutocovariance: hasNegative,
      rollModifiedSpread: Number(rollModifiedSpread.toFixed(4)),
    };
  }
}
