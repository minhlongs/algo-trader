/**
 * Empirical Challenger Stress Test Suite for Milestone 3:
 * VPIN & Kyle's Lambda Numerical Soundness and Boundary Stress Testing.
 *
 * Adversarial empirical tests:
 * 1. VPIN Calculator Stress Testing:
 *    - Multi-bucket spanning trade: single trade exceeding bucket capacity multiple times
 *      (e.g., 5,500 vol into 1,000 cap), verifying exact volume conservation.
 *    - Micro-trades: large volume of tiny trades (1e-5 vol) with zero price changes.
 *    - Tick test edge cases: identical prices, alternating midpoints, crossed books, and midpoint ties.
 *    - Cold start behavior: metric stability and NaN/exception absence before N buckets complete.
 * 2. Kyle's Lambda Calculator Stress Testing:
 *    - Zero-variance scenario: identical signed volumes (Var(Q) = 0), verifying safe fallback to baseline lambda.
 *    - Collinear data: perfect linear correlation with SE <= 10^-12, verifying asymptotic t-stat = 999.0.
 *    - Counter-intuitive negative slope: price drops while buy volume dominates, verifying non-negative clamp.
 *    - Window overflow: 1,000 trade intervals verifying FIFO sliding window bounds and EMA convergence.
 * 3. Integrated Adverse Selection Guard Stress Testing:
 *    - High-frequency trade bursts, dynamic quote widening bounds, and tripwire trigger & cooldown integrity.
 *
 * Conforms to AGENTS.md Hard Rules: zero :any, zero console.log.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  VpinCalculator,
  KyleLambdaCalculator,
  AdverseSelectionGuard,
  DynamicQuoteWideningController,
  InformedSweepDetector,
  InstantCancellationTripwire,
} from '../../../src/desk/marl/microstructure';
import type { VolumeBucket } from '../../../src/desk/marl/microstructure/vpin-calculator';

describe('Challenger M3: VPIN & Kyle\'s Lambda Numerical Soundness Empirical Harness', () => {

  // ═══════════════════════════════════════════════════════════════════════════
  // 1. VPIN STRESS TESTING
  // ═══════════════════════════════════════════════════════════════════════════
  describe('1. VPIN Calculator Numerical Soundness & Boundary Stress', () => {

    it('VPIN-1.1: multi-bucket spanning trade verifies exact volume conservation', () => {
      const bucketVolume = 1_000;
      const windowBuckets = 20;
      const vpin = new VpinCalculator({ bucketVolume, windowBuckets });

      // Ingest single trade with 5,500 volume into 1,000 bucket capacity
      const inputVolume = 5_500;
      vpin.addTrade({
        price: 100.5,
        volume: inputVolume,
        side: 'buy',
        timestamp: 1000,
      });

      // Verify 5 complete buckets were finalized
      const metricsBeforeFlush = vpin.getMetrics();
      expect(metricsBeforeFlush.completedBuckets).toBe(5);

      // Access internal volume metrics using strictly typed interface
      const internalVpin = vpin as unknown as {
        completedBuckets: VolumeBucket[];
        currentBuyVolume: number;
        currentSellVolume: number;
      };

      const completedVolume = internalVpin.completedBuckets.reduce(
        (sum, b) => sum + b.totalVolume,
        0,
      );
      const activeBucketVolume = internalVpin.currentBuyVolume + internalVpin.currentSellVolume;

      // Exact volume conservation: completed + active === inputVolume
      expect(completedVolume).toBe(5_000);
      expect(activeBucketVolume).toBe(500);
      expect(completedVolume + activeBucketVolume).toBe(inputVolume);

      // Flush remaining 500 volume via calendar/inactivity timeout
      vpin.forceTimeoutBucket();
      const metricsAfterFlush = vpin.getMetrics();
      expect(metricsAfterFlush.completedBuckets).toBe(6);

      const totalFlushedVolume = internalVpin.completedBuckets.reduce(
        (sum, b) => sum + b.totalVolume,
        0,
      );
      expect(totalFlushedVolume).toBe(inputVolume);
    });

    it('VPIN-1.2: multi-bucket spanning trade spanning 55 buckets maintains volume conservation', () => {
      const bucketVolume = 1_000;
      const windowBuckets = 100;
      const vpin = new VpinCalculator({ bucketVolume, windowBuckets });

      const massiveVolume = 55_000;
      vpin.addTrade({
        price: 50.0,
        volume: massiveVolume,
        side: 'sell',
        timestamp: 2000,
      });

      const metrics = vpin.getMetrics();
      expect(metrics.completedBuckets).toBe(55);

      const internalVpin = vpin as unknown as {
        completedBuckets: VolumeBucket[];
        currentBuyVolume: number;
        currentSellVolume: number;
      };
      const sumVolume = internalVpin.completedBuckets.reduce(
        (acc, b) => acc + b.totalVolume,
        0,
      );
      expect(sumVolume).toBe(massiveVolume);
      expect(internalVpin.currentBuyVolume).toBe(0);
      expect(internalVpin.currentSellVolume).toBe(0);
      expect(vpin.getVpin()).toBe(1.0);
    });

    it('VPIN-1.3: multi-bucket trade straddling pre-existing partially filled bucket', () => {
      const bucketVolume = 1_000;
      const vpin = new VpinCalculator({ bucketVolume, windowBuckets: 20 });

      // Pre-fill active bucket with 300 buy volume
      vpin.addTrade({ price: 100, volume: 300, side: 'buy', timestamp: 100 });
      expect(vpin.getMetrics().completedBuckets).toBe(0);

      // Ingest 5,500 buy volume: 700 completes bucket 0, 4 buckets of 1,000 complete, 800 remains in active
      vpin.addTrade({ price: 100, volume: 5_500, side: 'buy', timestamp: 200 });
      expect(vpin.getMetrics().completedBuckets).toBe(5);

      const internalVpin = vpin as unknown as {
        completedBuckets: VolumeBucket[];
        currentBuyVolume: number;
        currentSellVolume: number;
      };
      const completedVol = internalVpin.completedBuckets.reduce((s, b) => s + b.totalVolume, 0);
      const activeVol = internalVpin.currentBuyVolume + internalVpin.currentSellVolume;

      expect(completedVol).toBe(5_000);
      expect(activeVol).toBe(800);
      expect(completedVol + activeVol).toBe(5_800);
    });

    it('VPIN-1.4: micro-trades with 1e-5 volume and zero price changes accumulate stably', () => {
      const vpin = new VpinCalculator({ bucketVolume: 1.0, windowBuckets: 10 });
      const tradeCount = 5_000;
      const microVol = 1e-5;

      // 5,000 micro-trades at identical price 100.0 without side or midpoint
      for (let i = 0; i < tradeCount; i++) {
        vpin.addTrade({
          price: 100.0,
          volume: microVol,
          timestamp: 1000 + i,
        });
      }

      // Total volume = 5,000 * 1e-5 = 0.05
      const internalVpin = vpin as unknown as {
        currentBuyVolume: number;
        currentSellVolume: number;
      };
      const activeVol = internalVpin.currentBuyVolume + internalVpin.currentSellVolume;
      expect(activeVol).toBeCloseTo(0.05, 5);

      // Initial trade defaults to buy sign, subsequent zero-delta trades continue buy sign
      expect(internalVpin.currentBuyVolume).toBeCloseTo(0.05, 5);
      expect(internalVpin.currentSellVolume).toBe(0);

      const metrics = vpin.getMetrics();
      expect(Number.isFinite(metrics.vpin)).toBe(true);
      expect(Number.isFinite(metrics.zScore)).toBe(true);
      expect(Number.isFinite(metrics.cdf)).toBe(true);
      expect(Number.isNaN(metrics.vpin)).toBe(false);
    });

    it('VPIN-1.5: micro-trades complete buckets cleanly under cumulative volume', () => {
      const vpin = new VpinCalculator({ bucketVolume: 1.0, windowBuckets: 5 });
      const tradeCount = 250;
      const microVol = 0.01; // 250 * 0.01 = 2.50 volume -> 2 complete buckets, 0.50 active

      for (let i = 0; i < tradeCount; i++) {
        vpin.addTrade({
          price: 100.0,
          volume: microVol,
          side: 'buy',
          timestamp: 1000 + i,
        });
      }

      expect(vpin.getMetrics().completedBuckets).toBe(2);
      const internalVpin = vpin as unknown as {
        currentBuyVolume: number;
        completedBuckets: VolumeBucket[];
      };
      expect(internalVpin.currentBuyVolume).toBeCloseTo(0.50, 6);
      expect(vpin.getVpin()).toBe(1.0);
    });

    it('VPIN-1.6: tick test edge cases with identical prices and alternating midpoints', () => {
      const vpin = new VpinCalculator({ bucketVolume: 100, windowBuckets: 10 });

      // Trade 1: price 100 > midpoint 99 -> buy
      vpin.addTrade({ price: 100, volume: 10, midpoint: 99, timestamp: 1 });
      // Trade 2: price 100 < midpoint 101 -> sell
      vpin.addTrade({ price: 100, volume: 10, midpoint: 101, timestamp: 2 });
      // Trade 3: price 100 == midpoint 100, price == lastPrice 100 -> inherits lastSign (sell)
      vpin.addTrade({ price: 100, volume: 10, midpoint: 100, timestamp: 3 });
      // Trade 4: price 100 == midpoint 100, price == lastPrice 100 -> inherits lastSign (sell)
      vpin.addTrade({ price: 100, volume: 10, midpoint: 100, timestamp: 4 });
      // Trade 5: price 100 > midpoint 99 -> buy
      vpin.addTrade({ price: 100, volume: 10, midpoint: 99, timestamp: 5 });
      // Trade 6: price 100 == midpoint 100 -> inherits buy
      vpin.addTrade({ price: 100, volume: 10, midpoint: 100, timestamp: 6 });

      const internalVpin = vpin as unknown as {
        currentBuyVolume: number;
        currentSellVolume: number;
      };
      // Buys: Trade 1 (10), Trade 5 (10), Trade 6 (10) = 30
      // Sells: Trade 2 (10), Trade 3 (10), Trade 4 (10) = 30
      expect(internalVpin.currentBuyVolume).toBe(30);
      expect(internalVpin.currentSellVolume).toBe(30);
    });

    it('VPIN-1.7: crossed quotes (bid > ask) bypass midpoint and fall back to tick test', () => {
      const vpin = new VpinCalculator({ bucketVolume: 100, windowBuckets: 10 });

      // Baseline price established at 50.0
      vpin.addTrade({ price: 50.0, volume: 10, timestamp: 100 });

      // Trade at 51.0 with crossed book: bidPrice 52 > askPrice 48
      // Midpoint rule skipped because bid > ask; tick test: 51 > 50 -> buy
      vpin.addTrade({
        price: 51.0,
        volume: 10,
        bidPrice: 52.0,
        askPrice: 48.0,
        timestamp: 101,
      });

      const internalVpin = vpin as unknown as {
        currentBuyVolume: number;
        currentSellVolume: number;
      };
      expect(internalVpin.currentBuyVolume).toBe(20);
    });

    it('VPIN-1.8: cold start behavior before N buckets complete produces no NaN or throws', () => {
      const vpin = new VpinCalculator({ bucketVolume: 1_000, windowBuckets: 50 });

      // Cold start with 0 trades
      const m0 = vpin.getMetrics();
      expect(m0.vpin).toBe(0.0);
      expect(m0.completedBuckets).toBe(0);
      expect(Number.isFinite(m0.zScore)).toBe(true);
      expect(Number.isFinite(m0.cdf)).toBe(true);
      expect(m0.cdf).toBeGreaterThanOrEqual(0.0);
      expect(m0.cdf).toBeLessThanOrEqual(1.0);

      // Cold start with partial bucket (500 volume in 1,000 capacity)
      vpin.addTrade({ price: 100, volume: 500, side: 'buy' });
      const m1 = vpin.getMetrics();
      expect(m1.completedBuckets).toBe(0);
      expect(m1.vpin).toBe(0.0);
      expect(Number.isFinite(m1.zScore)).toBe(true);

      // Exactly 1 completed bucket out of 50 window
      vpin.addTrade({ price: 100, volume: 500, side: 'buy' });
      const m2 = vpin.getMetrics();
      expect(m2.completedBuckets).toBe(1);
      expect(m2.vpin).toBe(1.0);
      expect(Number.isFinite(m2.zScore)).toBe(true);
      expect(m2.cdf).toBeGreaterThan(0.99);

      // Verify reset clears state cleanly back to cold start
      vpin.reset();
      const mReset = vpin.getMetrics();
      expect(mReset.completedBuckets).toBe(0);
      expect(mReset.vpin).toBe(0.0);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. KYLE'S LAMBDA STRESS TESTING
  // ═══════════════════════════════════════════════════════════════════════════
  describe('2. Kyle\'s Lambda Calculator Numerical Soundness & Boundary Stress', () => {

    it('LAMBDA-2.1: zero-variance scenario (Var(Q) = 0) falls back safely to baseline lambda', () => {
      const baselineLambda = 0.0001;
      const kyle = new KyleLambdaCalculator({
        windowSize: 50,
        baselineLambda,
        minSamples: 3,
      });

      // Feed 20 intervals with varying price changes but IDENTICAL signed volume (Var(Q) = 0)
      for (let i = 1; i <= 20; i++) {
        kyle.addInterval(0.05 * (i % 2 === 0 ? 1 : -1), 100.0);
      }

      const metrics = kyle.getMetrics();
      expect(metrics.varQ).toBe(0);
      expect(metrics.lambda).toBe(baselineLambda);
      expect(metrics.tStat).toBe(0);
      expect(metrics.lambdaRatio).toBe(1.0);
      expect(metrics.isIlliquid).toBe(false);
      expect(Number.isNaN(metrics.lambda)).toBe(false);
      expect(Number.isNaN(metrics.tStat)).toBe(false);
    });

    it('LAMBDA-2.2: near-zero variance (Var(Q) < 1e-12) avoids numerical singularity', () => {
      const kyle = new KyleLambdaCalculator({ windowSize: 50, baselineLambda: 0.0002 });

      // Jitter signed volumes by microscopic noise 1e-8 -> variance < 1e-12
      for (let i = 1; i <= 10; i++) {
        kyle.addInterval(0.01 * i, 100.0 + (i % 2 === 0 ? 1e-8 : -1e-8));
      }

      const metrics = kyle.getMetrics();
      expect(metrics.varQ).toBeLessThan(1e-12);
      expect(metrics.lambda).toBe(0.0002);
      expect(metrics.tStat).toBe(0);
    });

    it('LAMBDA-2.3: collinear data (SE <= 10^-12) triggers asymptotic t-stat = 999.0 guard', () => {
      const kyle = new KyleLambdaCalculator({
        windowSize: 20,
        baselineLambda: 0.0001,
      });

      const trueSlope = 0.0035;
      // Perfect linear correlation: deltaP = trueSlope * signedVolume (zero residual error)
      for (let i = 1; i <= 15; i++) {
        const q = i * 10.0;
        const dp = trueSlope * q;
        kyle.addInterval(dp, q);
      }

      const metrics = kyle.getMetrics();
      expect(metrics.lambda).toBeCloseTo(trueSlope, 6);
      expect(metrics.rSquared).toBeCloseTo(1.0, 4);
      // Collinearity guard must set tStat to exactly 999.0
      expect(metrics.tStat).toBe(999.0);
      expect(Number.isFinite(metrics.tStat)).toBe(true);
      expect(Number.isNaN(metrics.tStat)).toBe(false);
    });

    it('LAMBDA-2.4: negative empirical slope is safely clamped to 0.0', () => {
      const kyle = new KyleLambdaCalculator({ windowSize: 20, baselineLambda: 0.0001 });

      // Scenario: price drops while buy volume surges (negative slope)
      for (let i = 1; i <= 10; i++) {
        const q = i * 20.0; // Positive buy flow: 20, 40, ...
        const dp = -0.002 * i; // Negative price drop: -0.002, -0.004, ...
        kyle.addInterval(dp, q);
      }

      const metrics = kyle.getMetrics();
      // Estimated slope is mathematically negative, but must be clamped to 0
      expect(metrics.lambda).toBe(0.0);
      expect(metrics.tStat).toBe(0.0);
      expect(metrics.lambdaRatio).toBe(0.0);
      expect(metrics.isIlliquid).toBe(false);
    });

    it('LAMBDA-2.5: window overflow over 1,000 intervals maintains FIFO size & EMA convergence', () => {
      const windowSize = 50;
      const initialBaseline = 0.0001;
      const trueSlope = 0.0025;
      const kyle = new KyleLambdaCalculator({
        windowSize,
        baselineLambda: initialBaseline,
        enableEmaBaseline: true,
        emaAlpha: 0.05,
      });

      // Feed 1,000 trade intervals
      for (let i = 1; i <= 1_000; i++) {
        const q = 10.0 + (i % 20);
        const dp = trueSlope * q;
        kyle.addInterval(dp, q, 1000 + i);
      }

      const metrics = kyle.getMetrics();

      // Verify FIFO window capacity bound
      expect(metrics.sampleCount).toBe(windowSize);
      const internalKyle = kyle as unknown as { samples: unknown[] };
      expect(internalKyle.samples.length).toBe(windowSize);

      // Verify estimated lambda matches true slope
      expect(metrics.lambda).toBeCloseTo(trueSlope, 5);

      // Verify EMA baseline has converged toward true slope from 0.0001
      expect(metrics.baselineLambda).toBeCloseTo(trueSlope, 3);
      expect(metrics.lambdaRatio).toBeCloseTo(1.0, 1);
    });

    it('LAMBDA-2.6: resets state cleanly and verifies independent second ingestion cycle', () => {
      const kyle = new KyleLambdaCalculator({ windowSize: 30, baselineLambda: 0.0001 });

      for (let i = 1; i <= 10; i++) {
        kyle.addInterval(0.05 * i, i);
      }
      expect(kyle.getMetrics().sampleCount).toBe(10);

      kyle.reset();
      const mReset = kyle.getMetrics();
      expect(mReset.sampleCount).toBe(0);
      expect(mReset.lambda).toBe(0.0001);
      expect(mReset.varQ).toBe(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. INTEGRATED ADVERSE SELECTION GUARD STRESS TESTING
  // ═══════════════════════════════════════════════════════════════════════════
  describe('3. AdverseSelectionGuard Integrated Stress & Shock Resilience', () => {

    it('GUARD-3.1: high-frequency trade burst (1,000 trades) executes with sub-millisecond overhead', () => {
      const guard = new AdverseSelectionGuard();
      const startTime = performance.now();

      for (let i = 1; i <= 1_000; i++) {
        guard.ingestTrade({
          price: 50.0 + (i * 0.001),
          volume: 200,
          bidPrice: 49.99 + (i * 0.001),
          askPrice: 50.01 + (i * 0.001),
          timestamp: 1000 + i,
        });
      }

      const elapsedMs = performance.now() - startTime;
      // 1,000 trades must process in under 100ms
      expect(elapsedMs).toBeLessThan(100);

      const snap = guard.evaluate(51.0, 0.01);
      expect(Number.isFinite(snap.vpin)).toBe(true);
      expect(Number.isFinite(snap.kylesLambda)).toBe(true);
      expect(Number.isFinite(snap.wideningMultiplier)).toBe(true);
      expect(snap.wideningMultiplier).toBeGreaterThanOrEqual(1.0);
      expect(snap.wideningMultiplier).toBeLessThanOrEqual(5.0);
    });

    it('GUARD-3.2: cancellation tripwire safely logs callback error without crashing caller', () => {
      const guard = new AdverseSelectionGuard();
      const failingCallback = vi.fn().mockImplementation(() => {
        throw new Error('Simulated network failure on quote cancellation');
      });

      guard.registerCancellationCallback(failingCallback);

      // Force instant sweep to trip cancellation
      guard.sweepDetector.registerDepletion('buy', 1000, 100);
      guard.sweepDetector.registerDepletion('buy', 1000, 110);
      guard.sweepDetector.registerDepletion('buy', 1000, 120);

      // evaluate should catch callback error and return valid snapshot without throwing
      expect(() => guard.evaluate(50.0, 0.01, 130)).not.toThrow();
      expect(failingCallback).toHaveBeenCalledTimes(1);
      expect(guard.isTripwireActive()).toBe(true);
    });

    it('GUARD-3.3: dynamic widening controller strictly bounds multiplier in [1.0, maxMultiplier]', () => {
      const ctrl = new DynamicQuoteWideningController(5.0, 0.75, 3.0, 1.5);

      // Below hurdles -> exactly 1.0
      expect(ctrl.calculateMultiplier(0.1, 0.1)).toBe(1.0);
      expect(ctrl.calculateMultiplier(0.75, 1.0)).toBe(1.0);

      // Extreme values -> clamped strictly to 5.0
      expect(ctrl.calculateMultiplier(1.0, 100.0)).toBe(5.0);
      expect(ctrl.calculateMultiplier(0.99, 10.0)).toBe(5.0);
    });
  });
});
