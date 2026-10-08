import { TradeExecution, VolumeBucket, VpinMetrics } from './microstructure-types';

export class VpinToxicityEstimator {
  /**
   * Volume-Synchronized Probability of Toxicity (VPIN) based on Easley et al.
   * Partitions continuous trade tape into volume buckets of size V.
   * VPIN = sum(|V_B - V_S|) / (N * V)
   */
  public computeVpin(
    trades: TradeExecution[],
    bucketSize: number,
    windowBuckets = 50
  ): VpinMetrics {
    if (trades.length < 2) throw new Error('At least 2 trades required for VPIN');
    if (bucketSize <= 0) throw new Error('Bucket size must be strictly positive');

    const buckets: VolumeBucket[] = [];
    let currentBuyVol = 0;
    let currentSellVol = 0;
    let currentTotalVol = 0;
    let bucketIdx = 0;

    for (let i = 1; i < trades.length; i++) {
      const prevTrade = trades[i - 1]!;
      const currTrade = trades[i]!;

      // Bulk Volume Classification (BVC): sign of delta P
      const deltaP = currTrade.price - prevTrade.price;
      let buyFrac = 0.5;
      if (deltaP > 0) buyFrac = 0.85;
      else if (deltaP < 0) buyFrac = 0.15;

      let tradeRemaining = currTrade.size;

      while (tradeRemaining > 0) {
        const spaceInBucket = bucketSize - currentTotalVol;
        const fillAmount = Math.min(tradeRemaining, spaceInBucket);

        const buyAmt = fillAmount * buyFrac;
        const sellAmt = fillAmount * (1.0 - buyFrac);

        currentBuyVol += buyAmt;
        currentSellVol += sellAmt;
        currentTotalVol += fillAmount;
        tradeRemaining -= fillAmount;

        if (currentTotalVol >= bucketSize - 1e-6) {
          buckets.push({
            bucketIndex: bucketIdx++,
            buyVolume: Number(currentBuyVol.toFixed(2)),
            sellVolume: Number(currentSellVol.toFixed(2)),
            totalVolume: bucketSize,
            orderImbalance: Number(Math.abs(currentBuyVol - currentSellVol).toFixed(2)),
          });
          currentBuyVol = 0;
          currentSellVol = 0;
          currentTotalVol = 0;
        }
      }
    }

    if (buckets.length === 0) {
      throw new Error('Insufficient volume to fill even one bucket');
    }

    // Take recent window
    const recent = buckets.slice(-windowBuckets);
    const sumImbalance = recent.reduce((acc, b) => acc + b.orderImbalance, 0);
    const totalVolumeSampled = recent.length * bucketSize;

    const vpin = sumImbalance / totalVolumeSampled;

    let regime: 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL' = 'LOW';
    if (vpin > 0.55) regime = 'CRITICAL';
    else if (vpin > 0.40) regime = 'HIGH';
    else if (vpin > 0.25) regime = 'MODERATE';

    return {
      vpin: Number(vpin.toFixed(4)),
      bucketCount: recent.length,
      bucketSize,
      averageAbsImbalance: Number((sumImbalance / recent.length).toFixed(2)),
      toxicityRegime: regime,
    };
  }
}
