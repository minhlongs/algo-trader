/**
 * Adaptive TWAP/VWAP Volume Profiling & Slicing Scheduler
 * Generates intraday execution schedules adapting to volume curve surprises.
 *
 * @module desk/execution/twap-vwap-scheduler
 */

import {
  ExecutionScheduleSlice,
  VolumeProfileBucket,
} from './algo-execution-types';

export class TwapVwapScheduler {
  private readonly defaultVolumeProfile: VolumeProfileBucket[] = [];

  public constructor(customProfile?: VolumeProfileBucket[]) {
    if (customProfile && customProfile.length > 0) {
      this.defaultVolumeProfile = [...customProfile];
    } else {
      // Default canonical U-shaped intraday volume curve (10 buckets)
      const uCurveShares = [0.18, 0.12, 0.08, 0.06, 0.05, 0.05, 0.06, 0.09, 0.13, 0.18];
      this.defaultVolumeProfile = uCurveShares.map((share, idx) => ({
        bucketIndex: idx,
        startMinuteOfDay: idx * 39,
        expectedVolumeShare: share,
      }));
    }
  }

  public generateTwapSchedule(
    totalQuantity: number,
    numSlices: number,
    startEpochMs: number,
    intervalMs: number
  ): ExecutionScheduleSlice[] {
    const slices: ExecutionScheduleSlice[] = [];
    const baseSliceQty = Number((totalQuantity / numSlices).toFixed(4));
    let accumulated = 0;

    for (let i = 0; i < numSlices; i++) {
      const isLast = i === numSlices - 1;
      const targetQty = isLast
        ? Number((totalQuantity - accumulated).toFixed(4))
        : baseSliceQty;
      accumulated = Number((accumulated + targetQty).toFixed(4));

      slices.push({
        sliceIndex: i,
        scheduledTimeMs: startEpochMs + i * intervalMs,
        targetQuantity: targetQty,
        targetCumulativeQuantity: accumulated,
        participationRate: 1 / numSlices,
      });
    }

    return slices;
  }

  public generateVwapSchedule(
    totalQuantity: number,
    startEpochMs: number,
    intervalMs: number,
    volumeProfile?: VolumeProfileBucket[]
  ): ExecutionScheduleSlice[] {
    const profile = volumeProfile ?? this.defaultVolumeProfile;
    const slices: ExecutionScheduleSlice[] = [];
    let accumulated = 0;

    for (let i = 0; i < profile.length; i++) {
      const bucket = profile[i];
      const isLast = i === profile.length - 1;
      const share = bucket ? bucket.expectedVolumeShare : 1 / profile.length;

      const targetQty = isLast
        ? Number((totalQuantity - accumulated).toFixed(4))
        : Number((totalQuantity * share).toFixed(4));
      accumulated = Number((accumulated + targetQty).toFixed(4));

      slices.push({
        sliceIndex: i,
        scheduledTimeMs: startEpochMs + i * intervalMs,
        targetQuantity: targetQty,
        targetCumulativeQuantity: accumulated,
        participationRate: share,
      });
    }

    return slices;
  }

  public adaptToVolumeSurprise(
    remainingQuantity: number,
    remainingSlices: number,
    realizedSurpriseRatio: number // > 1 if market is trading heavier than expected
  ): number {
    // If market volume is 1.2x expected (surprise ratio 1.2), increase current slice pacing
    const basePacing = remainingQuantity / Math.max(1, remainingSlices);
    const adaptedQty = basePacing * Math.min(2.0, Math.max(0.5, realizedSurpriseRatio));
    return Number(Math.min(remainingQuantity, adaptedQty).toFixed(4));
  }
}
