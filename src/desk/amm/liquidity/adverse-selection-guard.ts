/**
 * Adverse Selection & Toxic Flow Defense Guard
 * Volume-Synchronized Probability of Toxicity (VPIN) and dynamic fee tripwires
 * (Milestone 3 / Feature 11)
 */

import { logger } from '../../../shared/utils/logger';
import {
  AdverseSelectionConfig,
  ToxicityAssessment,
  ToxicityLevel,
} from '../types/liquidity-types';

export class AdverseSelectionGuard {
  private config: AdverseSelectionConfig;
  private currentBucketBuyVol: number = 0;
  private currentBucketSellVol: number = 0;
  private completedBucketImbalances: number[] = [];
  private recentVolumeEvents: { volume: number; timestamp: number }[] = [];

  constructor(config?: Partial<AdverseSelectionConfig>) {
    this.config = {
      bucketSizeVolume: config?.bucketSizeVolume ?? 1_000,
      windowBucketCount: config?.windowBucketCount ?? 10,
      vpinWarningThreshold: config?.vpinWarningThreshold ?? 0.4,
      vpinCriticalThreshold: config?.vpinCriticalThreshold ?? 0.7,
      maxDynamicFeeMultiplier: config?.maxDynamicFeeMultiplier ?? 3.0,
      sweepVelocityThreshold: config?.sweepVelocityThreshold ?? 2_500,
    };
  }

  public recordTrade(volume: number, side: 'BUY' | 'SELL', timestampMs: number = Date.now()): void {
    if (volume <= 0) return;
    this.recentVolumeEvents.push({ volume, timestamp: timestampMs });

    // Evict volume events older than 500ms
    const cutoff = timestampMs - 500;
    this.recentVolumeEvents = this.recentVolumeEvents.filter((e) => e.timestamp >= cutoff);

    let remainingBuy = side === 'BUY' ? volume : 0;
    let remainingSell = side === 'SELL' ? volume : 0;

    // Distribute trade volume across volume buckets
    while (
      this.currentBucketBuyVol + remainingBuy + this.currentBucketSellVol + remainingSell >=
      this.config.bucketSizeVolume
    ) {
      const spaceInBucket =
        this.config.bucketSizeVolume - (this.currentBucketBuyVol + this.currentBucketSellVol);

      const addBuy = side === 'BUY' ? Math.min(remainingBuy, spaceInBucket) : 0;
      const addSell = side === 'SELL' ? Math.min(remainingSell, spaceInBucket) : 0;

      const fullBucketBuy = this.currentBucketBuyVol + addBuy;
      const fullBucketSell = this.currentBucketSellVol + addSell;
      const imbalance = Math.abs(fullBucketBuy - fullBucketSell);

      this.completedBucketImbalances.push(imbalance);
      if (this.completedBucketImbalances.length > this.config.windowBucketCount) {
        this.completedBucketImbalances.shift();
      }

      remainingBuy -= addBuy;
      remainingSell -= addSell;
      this.currentBucketBuyVol = 0;
      this.currentBucketSellVol = 0;
    }

    this.currentBucketBuyVol += remainingBuy;
    this.currentBucketSellVol += remainingSell;
  }

  public assessFlow(tradeVolume: number, side: 'BUY' | 'SELL'): ToxicityAssessment {
    this.recordTrade(tradeVolume, side);

    let vpin = 0;
    if (this.completedBucketImbalances.length > 0) {
      const totalImbalance = this.completedBucketImbalances.reduce((a, b) => a + b, 0);
      const totalVol = this.completedBucketImbalances.length * this.config.bucketSizeVolume;
      vpin = Math.min(1.0, Math.max(0, totalVol > 0 ? totalImbalance / totalVol : 0));
    }

    // Check sweep burst velocity (last 100ms)
    const now = Date.now();
    const burstVol = this.recentVolumeEvents
      .filter((e) => e.timestamp >= now - 100)
      .reduce((a, b) => a + b.volume, 0);

    const isSweepBurst = burstVol > this.config.sweepVelocityThreshold;

    let toxicityLevel: ToxicityLevel = 'LOW';
    let dynamicFeeMultiplier = 1.0;
    let shouldTripwirePullQuotes = false;
    let cooldownPeriodMs = 0;
    let reason: string | undefined = undefined;

    if (vpin >= this.config.vpinCriticalThreshold - 1e-6 || isSweepBurst) {
      toxicityLevel = 'CRITICAL';
      dynamicFeeMultiplier = this.config.maxDynamicFeeMultiplier;
      shouldTripwirePullQuotes = true;
      cooldownPeriodMs = 30_000;
      reason = isSweepBurst ? 'RAPID_SWEEP_BURST_DETECTED' : 'CRITICAL_VPIN_EXCEEDED';
      logger.warn('[AdverseSelectionGuard] Critical toxicity tripwire activated', {
        vpin: Number(vpin.toFixed(4)),
        isSweepBurst,
        burstVol,
      });
    } else if (vpin >= this.config.vpinWarningThreshold - 1e-6) {
      toxicityLevel = 'HIGH';
      const range = this.config.vpinCriticalThreshold - this.config.vpinWarningThreshold;
      const progress = range > 0 ? (vpin - this.config.vpinWarningThreshold) / range : 1.0;
      dynamicFeeMultiplier = 1.0 + progress * (this.config.maxDynamicFeeMultiplier - 1.0);
    } else if (vpin >= 0.25) {
      toxicityLevel = 'MEDIUM';
      dynamicFeeMultiplier = 1.25;
    }

    return {
      vpin: Number(vpin.toFixed(4)),
      toxicityLevel,
      dynamicFeeMultiplier: Number(dynamicFeeMultiplier.toFixed(3)),
      shouldTripwirePullQuotes,
      cooldownPeriodMs,
      reason,
    };
  }

  public getCompletedBucketsCount(): number {
    return this.completedBucketImbalances.length;
  }
}
