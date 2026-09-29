/**
 * Deep unit tests for AdverseSelectionGuard and VirtualReserveTracker
 * Covering 100% branch and edge case execution for liquidity protection and reserve accounting.
 */

import { describe, it, expect } from 'vitest';
import { AdverseSelectionGuard } from '../../../../src/desk/amm/liquidity/adverse-selection-guard';
import { VirtualReserveTracker } from '../../../../src/desk/amm/pool/virtual-reserve-tracker';

describe('AdverseSelectionGuard Deep Branch Coverage', () => {
  it('handles negative or zero volume gracefully without updating buckets', () => {
    const guard = new AdverseSelectionGuard();
    guard.recordTrade(0, 'BUY');
    guard.recordTrade(-50, 'SELL');
    expect(guard.getCompletedBucketsCount()).toBe(0);

    const assessment = guard.assessFlow(0, 'BUY');
    expect(assessment.vpin).toBe(0);
    expect(assessment.toxicityLevel).toBe('LOW');
    expect(assessment.dynamicFeeMultiplier).toBe(1.0);
  });

  it('completes buckets, evicts older window buckets, and purges stale timestamps', () => {
    const guard = new AdverseSelectionGuard({
      bucketSizeVolume: 100,
      windowBucketCount: 2,
      sweepVelocityThreshold: 1000,
    });

    const now = Date.now();
    // Record trade with stale timestamp older than 500ms
    guard.recordTrade(50, 'BUY', now - 600);
    // Large trade spanning 2+ buckets: 50 + 250 = 300 volume (3 full buckets completed)
    guard.recordTrade(250, 'BUY', now);

    // Because windowBucketCount = 2, completed buckets are capped at 2
    expect(guard.getCompletedBucketsCount()).toBe(2);
  });

  it('evaluates flow levels across LOW, MEDIUM, HIGH, and CRITICAL thresholds', () => {
    // 1. Critical via rapid sweep burst
    const sweepGuard = new AdverseSelectionGuard({
      sweepVelocityThreshold: 500,
      bucketSizeVolume: 1000,
      maxDynamicFeeMultiplier: 3.0,
    });
    const sweepAssessment = sweepGuard.assessFlow(600, 'BUY');
    expect(sweepAssessment.toxicityLevel).toBe('CRITICAL');
    expect(sweepAssessment.shouldTripwirePullQuotes).toBe(true);
    expect(sweepAssessment.cooldownPeriodMs).toBe(30_000);
    expect(sweepAssessment.reason).toBe('RAPID_SWEEP_BURST_DETECTED');

    // 2. Critical via high VPIN
    const vpinGuard = new AdverseSelectionGuard({
      bucketSizeVolume: 100,
      windowBucketCount: 4,
      vpinCriticalThreshold: 0.7,
      sweepVelocityThreshold: 50_000, // prevent sweep burst trigger
    });
    // Record only BUY volume to maximize imbalance (imbalance = 100 per bucket, totalVol = 400 -> vpin = 1.0)
    vpinGuard.recordTrade(450, 'BUY');
    const critAssessment = vpinGuard.assessFlow(1, 'BUY');
    expect(critAssessment.vpin).toBeGreaterThanOrEqual(0.7);
    expect(critAssessment.toxicityLevel).toBe('CRITICAL');
    expect(critAssessment.reason).toBe('CRITICAL_VPIN_EXCEEDED');

    // 3. Medium toxicity (0.25 <= vpin < 0.40)
    const medGuard = new AdverseSelectionGuard({
      bucketSizeVolume: 100,
      windowBucketCount: 2,
      vpinWarningThreshold: 0.4,
      vpinCriticalThreshold: 0.7,
      sweepVelocityThreshold: 50_000,
    });
    // Bucket 1: 65 BUY, 35 SELL -> imbalance = 30
    medGuard.recordTrade(65, 'BUY');
    medGuard.recordTrade(35, 'SELL');
    // Bucket 2: 65 BUY, 35 SELL -> imbalance = 30
    medGuard.recordTrade(65, 'BUY');
    medGuard.recordTrade(35, 'SELL');
    // Total imbalance = 60, totalVol = 200 -> vpin = 0.30
    const medAssessment = medGuard.assessFlow(1, 'BUY');
    expect(medAssessment.vpin).toBeCloseTo(0.3, 2);
    expect(medAssessment.toxicityLevel).toBe('MEDIUM');
    expect(medAssessment.dynamicFeeMultiplier).toBe(1.25);

    // 4. High toxicity (0.40 <= vpin < 0.70)
    const highGuard = new AdverseSelectionGuard({
      bucketSizeVolume: 100,
      windowBucketCount: 1,
      vpinWarningThreshold: 0.4,
      vpinCriticalThreshold: 0.7,
      maxDynamicFeeMultiplier: 2.0,
      sweepVelocityThreshold: 50_000,
    });
    // Bucket: 75 BUY, 25 SELL -> imbalance = 50 -> vpin = 0.50
    highGuard.recordTrade(75, 'BUY');
    highGuard.recordTrade(25, 'SELL');
    const highAssessment = highGuard.assessFlow(1, 'BUY');
    expect(highAssessment.vpin).toBe(0.5);
    expect(highAssessment.toxicityLevel).toBe('HIGH');
    expect(highAssessment.dynamicFeeMultiplier).toBeGreaterThan(1.0);
    expect(highAssessment.dynamicFeeMultiplier).toBeLessThan(2.0);
  });
});

describe('VirtualReserveTracker Deep Branch Coverage', () => {
  it('throws on invalid constructor arguments and initializes default reserves', () => {
    expect(() => new VirtualReserveTracker(1)).toThrow('Market must have at least 2 outcomes');

    // Clamps negative initial collateral to 0 and initializes matching reserves
    const tracker1 = new VirtualReserveTracker(3, -50, [100, 200, 300]);
    expect(tracker1.getCollateralReserve()).toBe(0);
    expect(tracker1.getVirtualReserves()).toEqual([100, 200, 300]);

    // Falls back to zeros when length does not match numOutcomes
    const tracker2 = new VirtualReserveTracker(3, 100, [50, 50]);
    expect(tracker2.getVirtualReserves()).toEqual([0, 0, 0]);
  });

  it('handles complete set minting and merging with fees and error boundaries', () => {
    const tracker = new VirtualReserveTracker(2, 50);

    expect(() => tracker.mintCompleteSets(0)).toThrow('setCount must be positive');
    expect(() => tracker.mergeCompleteSets(-5)).toThrow('setCount must be positive');

    // Mint 100 sets with 20 bps fee
    const mintRes = tracker.mintCompleteSets(100, 20);
    expect(mintRes.operation).toBe('MINT');
    expect(mintRes.feeUsdc).toBeCloseTo(0.2, 4);
    expect(mintRes.collateralUsdc).toBeCloseTo(99.8, 4);
    expect(tracker.getOutcomeBalances()).toEqual([100, 100]);
    expect(tracker.getCollateralReserve()).toBeCloseTo(149.8, 4);

    // Merge error when balance is insufficient
    expect(() => tracker.mergeCompleteSets(150)).toThrow('Insufficient balance for outcome 0');

    // Merge error when collateral in vault is insufficient
    const depletedTracker = new VirtualReserveTracker(2, 0);
    (depletedTracker as any).outcomeBalances = [100, 100];
    expect(() => depletedTracker.mergeCompleteSets(50)).toThrow('Insufficient collateral reserve');

    // Successful merge
    const mergeRes = tracker.mergeCompleteSets(50, 10);
    expect(mergeRes.operation).toBe('MERGE');
    expect(tracker.getOutcomeBalances()).toEqual([50, 50]);
    expect(mergeRes.feeUsdc).toBeCloseTo(0.05, 4);
  });

  it('manages virtual reserves, collateral deposits, and withdrawals', () => {
    const tracker = new VirtualReserveTracker(2, 100, [50, 50]);

    // updateVirtualReserve
    expect(() => tracker.updateVirtualReserve(-1, 10)).toThrow('Invalid outcomeIndex');
    expect(() => tracker.updateVirtualReserve(2, 10)).toThrow('Invalid outcomeIndex');
    tracker.updateVirtualReserve(0, 15);
    expect(tracker.getVirtualReserves()[0]).toBe(65);

    // setVirtualReserves
    expect(() => tracker.setVirtualReserves([10])).toThrow('Reserves length mismatch');
    tracker.setVirtualReserves([80, 90]);
    expect(tracker.getVirtualReserves()).toEqual([80, 90]);

    // depositCollateral
    expect(() => tracker.depositCollateral(0)).toThrow('Deposit must be positive');
    tracker.depositCollateral(50);
    expect(tracker.getCollateralReserve()).toBe(150);

    // withdrawCollateral
    expect(() => tracker.withdrawCollateral(0)).toThrow('Invalid withdrawal amount');
    expect(() => tracker.withdrawCollateral(200)).toThrow('Invalid withdrawal amount');
    tracker.withdrawCollateral(40);
    expect(tracker.getCollateralReserve()).toBe(110);
  });
});
