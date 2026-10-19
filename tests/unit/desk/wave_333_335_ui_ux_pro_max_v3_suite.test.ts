import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  BacryMuzy2014Hawkes,
  ElEuchRosenbaum2019RoughHeston,
  OpenCoreSaas2026Monetization,
  Thorp2006KellyCriterion,
} from '../../../src/desk/index';

describe('Waves 333-335 Quantitative Triad & Stitch Screen #14 (regime-kelly-matrix) UI/UX Pro Max v3', () => {
  it('Wave 333: Thorp (2006) Continuous Fractional Kelly computes leverage and drawdown survival probability', () => {
    const engine = new Thorp2006KellyCriterion.Thorp2006KellyCriterion();
    const res = engine.evaluate({
      expectedExcessReturnAnnual: 0.18,
      returnVarianceAnnual: 0.5,
      fractionalMultiplier: 0.35,
      targetDrawdownThreshold: 0.2,
    });

    expect(res.fullKellyFraction).toBeCloseTo(0.36, 4);
    expect(res.effectiveLeverageFraction).toBeCloseTo(0.126, 4);
    expect(res.expectedLogGrowthRate).toBeGreaterThan(0);
    expect(res.drawdownSurvivalProbability).toBeGreaterThan(0.6);
    expect(res.sizingRegime).toBe('INSTITUTIONAL_FRACTIONAL');
  });

  it('Wave 334: Bacry, Mastromatteo & Muzy (2015) Hawkes branching ratio detects sub-critical vs near-critical flow', () => {
    const engine = new BacryMuzy2014Hawkes.BacryMuzy2014Hawkes();
    const res = engine.evaluate({
      baselineIntensityPerSec: 2.5,
      selfExcitationAlpha: 1.2,
      readonlycrossExcitationAlpha: 0.4,
      exponentialDecayBeta: 2.5,
      recentEventTimestampsSec: [9.2, 9.6, 9.9],
      currentTimeSec: 10.0,
    });

    expect(res.branchingRatio).toBeCloseTo(0.64, 4);
    expect(res.stationaryMeanIntensity).toBeGreaterThan(2.5);
    expect(res.instantaneousIntensity).toBeGreaterThan(2.5);
    expect(res.criticalityState).toBe('SUB_CRITICAL_STABLE');
  });

  it('Wave 335: El Euch & Rosenbaum (2019) Rough Heston evaluates fractional kernel alpha and ATM skew scaling', () => {
    const engine = new ElEuchRosenbaum2019RoughHeston.ElEuchRosenbaum2019RoughHeston();
    const res = engine.evaluate({
      hurstExponent: 0.12,
      volOfVolNu: 0.45,
      spotVolCorrelationRho: -0.65,
      spotVarianceV0: 0.04,
      meanReversionLambda: 1.5,
      timeToMaturityYears: 0.1,
    });

    expect(res.fractionalAlpha).toBeCloseTo(0.62, 4);
    expect(res.shortTermAtmSkewSlope).toBeLessThan(0);
    expect(res.surfaceRegime).toBe('ROUGH_STEEP_SKEW');
  });

  it('Stitch Screen #14 (regime-kelly-matrix): verifies Regime-Kelly snapshot, HTML deliverable, and 15-file UI/UX Pro Max audit', () => {
    const cockpit = new OpenCoreSaas2026Monetization.StitchUiCockpitEngine();
    const snap = cockpit.getRegimeKellySnapshot('NORMAL_LIQUID', 1248500);

    expect(snap.screenId).toBe('regime-kelly-matrix');
    expect(snap.screenNumber).toBe(14);
    expect(snap.sviButterflyArbitrageFree).toBe(true);
    expect(snap.allocations).toHaveLength(4);

    const htmlPath = join(process.cwd(), 'site/public/regime-kelly-matrix.html');
    expect(existsSync(htmlPath)).toBe(true);
    const html = readFileSync(htmlPath, 'utf8');
    expect(html).toContain('Multi-Regime Fractional Kelly Allocation Matrix');

    const auditor = new OpenCoreSaas2026Monetization.UiUxProMaxAuditor();
    const audit = auditor.auditPublicDirectory();
    expect(audit.auditedScreensCount).toBeGreaterThanOrEqual(15);
    expect(audit.passedAllScreens).toBe(true);
    expect(audit.averageScorePct).toBe(100);
  });
});
