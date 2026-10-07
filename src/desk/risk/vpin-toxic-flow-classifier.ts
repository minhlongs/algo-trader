/**
 * VPIN Toxic Flow Classifier Engine
 *
 * Computes Volume-Synchronized Probability of Toxicity (VPIN) and Shannon
 * order flow entropy to alert against informed toxicity & toxic sweeps.
 *
 * @module desk/risk/vpin-toxic-flow-classifier
 */

import type {
  ExecutedTradeTick,
  ToxicityRegime,
  VpinClassifierConfig,
  VpinToxicityMetrics,
} from './vpin-toxic-flow-types';

interface VolumeBucket {
  buyVolume: number;
  sellVolume: number;
}

export class VpinToxicFlowClassifier {
  private readonly config: VpinClassifierConfig;
  private readonly bucketsByMarket: Map<string, VolumeBucket[]> = new Map();
  private readonly currentBucketByMarket: Map<string, VolumeBucket> = new Map();

  public constructor(config?: Partial<VpinClassifierConfig>) {
    this.config = {
      bucketVolumeSize: config?.bucketVolumeSize ?? 1_000,
      totalBucketsN: config?.totalBucketsN ?? 20,
      toxicThreshold: config?.toxicThreshold ?? 0.65,
      elevatedThreshold: config?.elevatedThreshold ?? 0.45,
    };
  }

  public recordTrade(marketId: string, trade: ExecutedTradeTick): void {
    const isBuy = trade.price >= trade.arrivalMidPrice;
    const bucket = this.currentBucketByMarket.get(marketId) ?? { buyVolume: 0, sellVolume: 0 };

    if (isBuy) {
      bucket.buyVolume += trade.volume;
    } else {
      bucket.sellVolume += trade.volume;
    }

    const currentFilled = bucket.buyVolume + bucket.sellVolume;
    if (currentFilled >= this.config.bucketVolumeSize) {
      const completedBuckets = this.bucketsByMarket.get(marketId) ?? [];
      completedBuckets.push({ ...bucket });

      while (completedBuckets.length > this.config.totalBucketsN) {
        completedBuckets.shift();
      }

      this.bucketsByMarket.set(marketId, completedBuckets);
      this.currentBucketByMarket.set(marketId, { buyVolume: 0, sellVolume: 0 });
    } else {
      this.currentBucketByMarket.set(marketId, bucket);
    }
  }

  public computeVpin(marketId: string): number {
    const buckets = this.bucketsByMarket.get(marketId) ?? [];
    if (buckets.length === 0) return 0;

    let totalVolumeImbalance = 0;
    let totalVolume = 0;

    for (const b of buckets) {
      totalVolumeImbalance += Math.abs(b.buyVolume - b.sellVolume);
      totalVolume += b.buyVolume + b.sellVolume;
    }

    if (totalVolume === 0) return 0;
    return totalVolumeImbalance / totalVolume;
  }

  public computeShannonEntropy(marketId: string): number {
    const buckets = this.bucketsByMarket.get(marketId) ?? [];
    if (buckets.length === 0) return 1.0;

    const counts: number[] = [];
    let totalVol = 0;

    for (const b of buckets) {
      const vol = b.buyVolume + b.sellVolume;
      if (vol > 0) {
        counts.push(vol);
        totalVol += vol;
      }
    }

    if (totalVol === 0 || counts.length <= 1) return 1.0;

    let entropy = 0;
    for (const count of counts) {
      const p = count / totalVol;
      if (p > 0) {
        entropy -= p * Math.log2(p);
      }
    }

    // Normalized entropy [0, 1]
    const maxEntropy = Math.log2(counts.length);
    return maxEntropy > 0 ? entropy / maxEntropy : 1.0;
  }

  public evaluateMarketToxicity(marketId: string, nowMs: number): VpinToxicityMetrics {
    const vpin = this.computeVpin(marketId);
    const entropy = this.computeShannonEntropy(marketId);

    let regime: ToxicityRegime = 'BENIGN';
    let spreadMultiplier = 1.0;
    let isAdverseSelection = false;

    if (vpin >= this.config.toxicThreshold) {
      regime = 'TOXIC_INFORMED';
      spreadMultiplier = 2.5;
      isAdverseSelection = true;
    } else if (vpin >= this.config.elevatedThreshold) {
      regime = 'ELEVATED';
      spreadMultiplier = 1.5;
      isAdverseSelection = false;
    }

    return {
      marketId,
      currentVpin: Math.round(vpin * 1000) / 1000,
      orderEntropy: Math.round(entropy * 1000) / 1000,
      toxicityRegime: regime,
      recommendedSpreadMultiplier: spreadMultiplier,
      isAdverseSelectionImminent: isAdverseSelection,
      timestampMs: nowMs,
    };
  }
}
