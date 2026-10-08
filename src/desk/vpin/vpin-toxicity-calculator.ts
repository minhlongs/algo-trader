import { TradeTick, VolumeBucket, VpinCalculationResult } from './vpin-types';

export class VpinToxicityCalculator {
  public calculateVpin(
    ticks: TradeTick[],
    bucketSize: number,
    rollingWindowBuckets = 50,
    toxicityThreshold = 0.35
  ): VpinCalculationResult {
    if (ticks.length < 2 || bucketSize <= 0) {
      throw new Error('Valid ticks and positive bucket size required');
    }

    const buckets: VolumeBucket[] = [];
    let currentBuyVol = 0;
    let currentSellVol = 0;
    let currentBucketFilled = 0;

    for (let i = 1; i < ticks.length; i++) {
      const prevPrice = ticks[i - 1]!.price;
      const currPrice = ticks[i]!.price;
      const vol = ticks[i]!.volume;

      // Bulk Volume Classification (BVC): buy fraction based on price change
      const deltaP = currPrice - prevPrice;
      let buyFraction = 0.5;
      if (deltaP > 0) buyFraction = 0.85;
      else if (deltaP < 0) buyFraction = 0.15;

      let remainingVol = vol;

      while (remainingVol > 0) {
        const capacity = bucketSize - currentBucketFilled;
        const fill = Math.min(remainingVol, capacity);

        currentBuyVol += fill * buyFraction;
        currentSellVol += fill * (1.0 - buyFraction);
        currentBucketFilled += fill;
        remainingVol -= fill;

        if (currentBucketFilled >= bucketSize) {
          buckets.push({
            bucketIndex: buckets.length,
            totalVolume: bucketSize,
            buyVolume: Number(currentBuyVol.toFixed(2)),
            sellVolume: Number(currentSellVol.toFixed(2)),
            orderImbalance: Number(Math.abs(currentBuyVol - currentSellVol).toFixed(2)),
          });

          currentBuyVol = 0;
          currentSellVol = 0;
          currentBucketFilled = 0;
        }
      }
    }

    const completed = buckets.length;
    if (completed === 0) {
      return {
        vpinScore: 0,
        completedBucketsCount: 0,
        bucketSize,
        isToxicFlow: false,
        toxicityRegime: 'LOW',
      };
    }

    const windowBuckets = buckets.slice(-Math.min(completed, rollingWindowBuckets));
    const totalImbalance = windowBuckets.reduce((acc, b) => acc + b.orderImbalance, 0);
    const totalVolInWindow = windowBuckets.length * bucketSize;

    const vpinScore = totalVolInWindow > 0 ? totalImbalance / totalVolInWindow : 0;

    let regime: 'LOW' | 'NORMAL' | 'ELEVATED' | 'EXTREME' = 'LOW';
    if (vpinScore >= 0.50) regime = 'EXTREME';
    else if (vpinScore >= toxicityThreshold) regime = 'ELEVATED';
    else if (vpinScore >= 0.20) regime = 'NORMAL';

    return {
      vpinScore: Number(vpinScore.toFixed(4)),
      completedBucketsCount: completed,
      bucketSize,
      isToxicFlow: vpinScore >= toxicityThreshold,
      toxicityRegime: regime,
    };
  }
}
