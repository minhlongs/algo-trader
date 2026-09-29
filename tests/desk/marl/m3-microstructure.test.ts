/**
 * Milestone 3 Unit Test Suite: Adverse Selection Defense & Microstructure Alpha.
 * Tests VPIN accumulation, Lee-Ready classification, Kyle's Lambda OLS slope,
 * dynamic spread widening multipliers, informed sweep burst detection,
 * defensive cancellation tripwire, and full integrated guard cycles.
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
import { calculateOptimalQuotes } from '../../../src/desk/marl/models/avellaneda-stoikov';

describe('Milestone 3: Adverse Selection Defense & Microstructure Alpha', () => {

  // ═══════════════════════════════════════════════════════════════════════════
  // 1. VPIN Bucket Accumulation & Trade Classification (7 tests)
  // ═══════════════════════════════════════════════════════════════════════════
  describe('1. VPIN Bucket Accumulation & Trade Classification', () => {
    let vpin: VpinCalculator;

    beforeEach(() => {
      vpin = new VpinCalculator({ bucketVolume: 100, windowBuckets: 10 });
    });

    it('T1.1: classifies trade as buyer-initiated when trade price exceeds quote midpoint', () => {
      vpin.addTrade({ price: 0.52, quantity: 100, midpoint: 0.50, timestamp: 1000 });
      expect(vpin.getVpin()).toBe(1.0);
    });

    it('T1.2: classifies trade as seller-initiated when trade price is below quote midpoint', () => {
      vpin.addTrade({ price: 0.48, quantity: 100, midpoint: 0.50, timestamp: 1000 });
      expect(vpin.getVpin()).toBe(1.0);
    });

    it('T1.3: executes tick test fallback when trade price equals quote midpoint', () => {
      vpin.addTrade({ price: 0.50, quantity: 50, midpoint: 0.50, timestamp: 1000 });
      vpin.addTrade({ price: 0.51, quantity: 50, midpoint: 0.51, timestamp: 1001 });
      expect(vpin.getVpin()).toBe(1.0);
    });

    it('T1.4: inherits previous tick sign when consecutive trades occur at unchanged midpoint', () => {
      vpin.addTrade({ price: 0.49, quantity: 50, midpoint: 0.50, timestamp: 1000 });
      vpin.addTrade({ price: 0.49, quantity: 50, midpoint: 0.49, timestamp: 1001 });
      expect(vpin.getVpin()).toBe(1.0);
    });

    it('T1.5: splits large trade straddling bucket boundary across consecutive buckets', () => {
      vpin.addTrade({ price: 0.52, quantity: 250, midpoint: 0.50, timestamp: 1000 });
      expect(vpin.getVpin()).toBe(1.0);
      const metrics = vpin.getMetrics();
      expect(metrics.completedBuckets).toBe(2);
    });

    it('T1.6: supports explicit trade side override without requiring midpoint calculation', () => {
      vpin.addTrade({ price: 0.50, quantity: 100, side: 'buy', timestamp: 1000 });
      expect(vpin.getVpin()).toBe(1.0);
    });

    it('T1.7: validates config via Zod schema and rejects negative bucket volume', () => {
      expect(() => new VpinCalculator({ bucketVolume: -50 })).toThrow();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. Rolling VPIN Calculation, CDF Normalization & Cold Start (7 tests)
  // ═══════════════════════════════════════════════════════════════════════════
  describe('2. Rolling VPIN Calculation, CDF Normalization & Cold Start', () => {
    it('T2.1: computes zero VPIN for perfectly balanced buy and sell order flow', () => {
      const vpin = new VpinCalculator({ bucketVolume: 100, windowBuckets: 10 });
      for (let i = 0; i < 5; i++) {
        vpin.addTrade({ price: 0.52, quantity: 50, midpoint: 0.50, timestamp: 1000 + i });
        vpin.addTrade({ price: 0.48, quantity: 50, midpoint: 0.50, timestamp: 1000 + i });
      }
      expect(vpin.getVpin()).toBe(0.0);
    });

    it('T2.2: computes high VPIN (> 0.70) for unidirectional toxic flow', () => {
      const vpin = new VpinCalculator({ bucketVolume: 100, windowBuckets: 10 });
      for (let i = 0; i < 5; i++) {
        vpin.addTrade({ price: 0.52, quantity: 90, midpoint: 0.50, timestamp: 1000 + i });
        vpin.addTrade({ price: 0.48, quantity: 10, midpoint: 0.50, timestamp: 1000 + i });
      }
      expect(vpin.getVpin()).toBeCloseTo(0.80, 2);
    });

    it('T2.3: evicts older buckets as new buckets complete beyond sliding window size N', () => {
      const vpin = new VpinCalculator({ bucketVolume: 100, windowBuckets: 3 });
      for (let i = 0; i < 3; i++) {
        vpin.addTrade({ price: 0.52, quantity: 100, midpoint: 0.50, timestamp: 1000 + i });
      }
      expect(vpin.getVpin()).toBe(1.0);
      for (let i = 0; i < 3; i++) {
        vpin.addTrade({ price: 0.52, quantity: 50, midpoint: 0.50, timestamp: 2000 + i });
        vpin.addTrade({ price: 0.48, quantity: 50, midpoint: 0.50, timestamp: 2000 + i });
      }
      expect(vpin.getVpin()).toBe(0.0);
    });

    it('T2.4: cold start returns baseline metrics when no buckets have completed', () => {
      const vpin = new VpinCalculator({ bucketVolume: 1000, windowBuckets: 10 });
      vpin.addTrade({ price: 0.50, quantity: 100, midpoint: 0.50 });
      expect(vpin.getVpin()).toBe(0.0);
      expect(vpin.getMetrics().completedBuckets).toBe(0);
    });

    it('T2.5: computes statistical Z-score relative to historical mean and std', () => {
      const vpin = new VpinCalculator({ bucketVolume: 100, windowBuckets: 10, historicalMean: 0.25, historicalStd: 0.15 });
      vpin.addTrade({ price: 0.52, quantity: 100, midpoint: 0.50 });
      const metrics = vpin.getMetrics();
      expect(metrics.zScore).toBeCloseTo(5.0, 2);
    });

    it('T2.6: computes monotonic CDF bounded in [0.0, 1.0]', () => {
      const vpin = new VpinCalculator({ bucketVolume: 100, windowBuckets: 10 });
      vpin.addTrade({ price: 0.52, quantity: 100, midpoint: 0.50 });
      expect(vpin.getCdf()).toBeGreaterThan(0.99);
      expect(vpin.getCdf()).toBeLessThanOrEqual(1.0);
    });

    it('T2.7: forceTimeoutBucket flushes pending bucket volume on calendar timeout', () => {
      const vpin = new VpinCalculator({ bucketVolume: 1000, windowBuckets: 10 });
      vpin.addTrade({ price: 0.52, quantity: 200, midpoint: 0.50 });
      expect(vpin.getMetrics().completedBuckets).toBe(0);
      vpin.forceTimeoutBucket();
      expect(vpin.getMetrics().completedBuckets).toBe(1);
      expect(vpin.getVpin()).toBe(1.0);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. Kyle's Lambda OLS Slope, Zero-Variance Protection & Impact Ratio (7 tests)
  // ═══════════════════════════════════════════════════════════════════════════
  describe('3. Kyle\'s Lambda OLS Slope, Zero-Variance Protection & Impact Ratio', () => {
    let kyle: KyleLambdaCalculator;

    beforeEach(() => {
      kyle = new KyleLambdaCalculator({ windowSize: 50, baselineLambda: 0.0001 });
    });

    it('T3.1: estimates exact positive OLS slope under linear price impact', () => {
      for (let i = 1; i <= 10; i++) {
        kyle.addInterval(0.001 * i * 10, i * 10);
      }
      expect(kyle.getLambda()).toBeCloseTo(0.001, 4);
    });

    it('T3.2: guards against zero variance Var(Q) = 0 by falling back to baseline lambda', () => {
      for (let i = 0; i < 10; i++) {
        kyle.addInterval(0.01, 100);
      }
      expect(kyle.getLambda()).toBe(0.0001);
      expect(kyle.getMetrics().tStat).toBe(0);
    });

    it('T3.3: clamps negative empirical regression slopes to non-negative (lambda >= 0)', () => {
      for (let i = 1; i <= 10; i++) {
        kyle.addInterval(-0.01 * i, 10 * i);
      }
      expect(kyle.getLambda()).toBe(0);
    });

    it('T3.4: computes standard error and t-statistic for regression slope', () => {
      for (let i = 1; i <= 20; i++) {
        kyle.addInterval(0.05 * i, i);
      }
      expect(kyle.getMetrics().tStat).toBeGreaterThan(2.0);
    });

    it('T3.5: handles perfect collinearity without divide-by-zero, setting asymptotic tStat', () => {
      for (let i = 1; i <= 10; i++) {
        kyle.addInterval(0.005 * i, i);
      }
      expect(kyle.getMetrics().tStat).toBe(999.0);
    });

    it('T3.6: adapts baseline lambda via EMA during normal market flow', () => {
      const adaptiveKyle = new KyleLambdaCalculator({
        windowSize: 50,
        baselineLambda: 0.0001,
        enableEmaBaseline: true,
        emaAlpha: 0.10,
      });
      for (let i = 1; i <= 10; i++) {
        adaptiveKyle.addInterval(0.002 * i, i);
      }
      expect(adaptiveKyle.getMetrics().baselineLambda).toBeGreaterThan(0.0001);
    });

    it('T3.7: flags illiquidity shock when instantaneous impact ratio exceeds threshold', () => {
      for (let i = 1; i <= 10; i++) {
        kyle.addInterval(0.01 * i, i);
      }
      expect(kyle.getLambdaRatio()).toBeGreaterThan(2.0);
      expect(kyle.getMetrics().isIlliquid).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 4. Dynamic Quote Widening Multiplier Formulation (7 tests)
  // ═══════════════════════════════════════════════════════════════════════════
  describe('4. Dynamic Quote Widening Multiplier Formulation', () => {
    const ctrl = new DynamicQuoteWideningController(5.0, 0.75, 3.0, 1.5);

    it('T4.1: returns baseline multiplier 1.0 when VPIN and lambda are below hurdles', () => {
      expect(ctrl.calculateMultiplier(0.50, 0.80)).toBe(1.0);
    });

    it('T4.2: scales multiplier linearly as VPIN CDF exceeds hurdle 0.75', () => {
      expect(ctrl.calculateMultiplier(0.85, 1.0)).toBeCloseTo(1.30, 2);
    });

    it('T4.3: scales multiplier linearly as Kyle\'s lambda ratio exceeds baseline 1.0', () => {
      expect(ctrl.calculateMultiplier(0.50, 2.0)).toBeCloseTo(2.50, 2);
    });

    it('T4.4: compounds widening when both VPIN and lambda surge concurrently', () => {
      expect(ctrl.calculateMultiplier(0.90, 2.0)).toBeCloseTo(2.95, 2);
    });

    it('T4.5: strictly clamps widening multiplier to maximum ceiling 5.0', () => {
      expect(ctrl.calculateMultiplier(1.0, 50.0)).toBe(5.0);
    });

    it('T4.6: never deflates multiplier below 1.0 for negative excess inputs', () => {
      expect(ctrl.calculateMultiplier(0.10, 0.10)).toBe(1.0);
    });

    it('T4.7: widens Avellaneda-Stoikov half-spreads by multiplying with W_t', () => {
      const baseSpread = 0.04;
      const w = ctrl.calculateMultiplier(0.85, 1.0);
      const widenedSpread = baseSpread * w;
      expect(widenedSpread).toBeCloseTo(0.052, 3);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 5. Informed Sweep Burst & Fast Price Shock Detector (7 tests)
  // ═══════════════════════════════════════════════════════════════════════════
  describe('5. Informed Sweep Burst & Fast Price Shock Detector', () => {
    let detector: InformedSweepDetector;

    beforeEach(() => {
      detector = new InformedSweepDetector(50, 3, 3.0);
    });

    it('T5.1: detects aggressive sweep when >= 3 book levels are depleted within 50ms', () => {
      const now = Date.now();
      detector.registerDepletion('buy', 500, now - 30);
      detector.registerDepletion('buy', 800, now - 20);
      detector.registerDepletion('buy', 1200, now - 5);
      const res = detector.checkSweep(0.50, 0.01, now);
      expect(res.sweepDetected).toBe(true);
      expect(res.direction).toBe('buy');
      expect(res.levelsDepleted).toBe(3);
    });

    it('T5.2: reports sell sweep direction when bids are aggressively hit', () => {
      const now = Date.now();
      detector.registerDepletion('sell', 400, now - 30);
      detector.registerDepletion('sell', 600, now - 20);
      detector.registerDepletion('sell', 900, now - 10);
      const res = detector.checkSweep(0.50, 0.01, now);
      expect(res.sweepDetected).toBe(true);
      expect(res.direction).toBe('sell');
    });

    it('T5.3: calculates total volume swept across depleted levels', () => {
      const now = Date.now();
      detector.registerDepletion('buy', 500, now - 20);
      detector.registerDepletion('buy', 500, now - 10);
      detector.registerDepletion('buy', 500, now);
      const res = detector.checkSweep(0.50, 0.01, now);
      expect(res.volumeSwept).toBe(1500);
    });

    it('T5.4: detects fast price jump anomaly exceeding 3 * sigma_mid', () => {
      detector.checkSweep(0.50, 0.01);
      const res = detector.checkSweep(0.54, 0.01);
      expect(res.sweepDetected).toBe(true);
      expect(res.fastJumpAnomaly).toBe(true);
    });

    it('T5.5: ignores isolated single-level executions without false alarms', () => {
      detector.registerDepletion('buy', 100);
      const res = detector.checkSweep(0.50, 0.01);
      expect(res.sweepDetected).toBe(false);
    });

    it('T5.6: purges level depletions older than the 50ms window', () => {
      const now = Date.now();
      detector.registerDepletion('buy', 500, now - 200);
      detector.registerDepletion('buy', 500, now - 150);
      detector.registerDepletion('buy', 500, now);
      const res = detector.checkSweep(0.50, 0.01, now);
      expect(res.sweepDetected).toBe(false);
    });

    it('T5.7: handles mixed buy and sell depletions without crossing thresholds', () => {
      const now = Date.now();
      detector.registerDepletion('buy', 500, now - 30);
      detector.registerDepletion('buy', 500, now - 20);
      detector.registerDepletion('sell', 500, now - 10);
      const res = detector.checkSweep(0.50, 0.01, now);
      expect(res.sweepDetected).toBe(false);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 6. Defensive Cancellation Tripwire & Full Integration (7 tests)
  // ═══════════════════════════════════════════════════════════════════════════
  describe('6. Defensive Cancellation Tripwire & Full Integration', () => {
    it('T6.1: trips instant cancellation when VPIN CDF reaches critical threshold (>= 0.95)', () => {
      const tripwire = new InstantCancellationTripwire(0.95, 500, 4.0);
      const res = tripwire.evaluate(0.96, 1.0, false);
      expect(res.tripwireActive).toBe(true);
      expect(res.reason).toBe('critical_vpin_breach');
    });

    it('T6.2: trips instant cancellation when lambda ratio indicates liquidity collapse (>= 4.0)', () => {
      const tripwire = new InstantCancellationTripwire(0.95, 500, 4.0);
      const res = tripwire.evaluate(0.50, 4.5, false);
      expect(res.tripwireActive).toBe(true);
      expect(res.reason).toBe('liquidity_black_hole');
    });

    it('T6.3: trips instant cancellation upon informed sweep detection', () => {
      const tripwire = new InstantCancellationTripwire(0.95, 500, 4.0);
      const res = tripwire.evaluate(0.50, 1.0, true);
      expect(res.tripwireActive).toBe(true);
      expect(res.reason).toBe('informed_sweep_burst');
    });

    it('T6.4: invokes registered cancellation callback upon tripwire trigger', () => {
      const guard = new AdverseSelectionGuard();
      const cancelFn = vi.fn();
      guard.registerCancellationCallback(cancelFn);

      for (let i = 0; i < 20; i++) {
        guard.ingestTrade({ price: 0.52, volume: 1000, bidPrice: 0.49, askPrice: 0.51 });
      }
      guard.evaluate(0.52, 0.01);
      expect(cancelFn).toHaveBeenCalled();
      expect(guard.isTripwireActive()).toBe(true);
    });

    it('T6.5: enforces cooldown period suppressing quoting resumption', () => {
      const tripwire = new InstantCancellationTripwire(0.95, 500, 4.0);
      const now = 1_000_000;
      tripwire.evaluate(0.98, 1.0, false, now);

      const resInCooldown = tripwire.evaluate(0.20, 1.0, false, now + 200);
      expect(resInCooldown.tripwireActive).toBe(true);
      expect(resInCooldown.reason).toBe('quarantine_cooldown_active');

      const resAfter = tripwire.evaluate(0.20, 1.0, false, now + 600);
      expect(resAfter.tripwireActive).toBe(false);
    });

    it('T6.6: allows immediate quoting resumption after manual reset()', () => {
      const guard = new AdverseSelectionGuard();
      guard.evaluate(0.60, 0.01);
      expect(guard.isTripwireActive()).toBe(true);

      guard.reset();
      expect(guard.isTripwireActive()).toBe(false);
    });

    it('T6.7: end-to-end integration dynamically widens Avellaneda-Stoikov quoting before tripping', () => {
      const guard = new AdverseSelectionGuard();
      
      const snapCalm = guard.evaluate(0.50, 0.01);
      expect(snapCalm.wideningMultiplier).toBe(1.0);
      expect(snapCalm.tripwireActive).toBe(false);

      const baseQuotes = calculateOptimalQuotes({
        midPrice: 0.50,
        inventory: 0,
        gamma: 0.1,
        sigma: 0.02,
        timeToHorizon: 100,
        kappa: 1.5,
      });

      for (let i = 0; i < 5; i++) {
        guard.ingestTrade({ price: 0.52, volume: 300, bidPrice: 0.49, askPrice: 0.51 });
      }
      const snapWarning = guard.evaluate(0.505, 0.01);
      const widenedHalfSpread = baseQuotes.bidSpread * snapWarning.wideningMultiplier;
      expect(widenedHalfSpread).toBeGreaterThanOrEqual(baseQuotes.bidSpread);

      const snapCrash = guard.evaluate(0.58, 0.01);
      expect(snapCrash.tripwireActive).toBe(true);
      expect(snapCrash.sweepDetected).toBe(true);
    });
  });
});
