import { describe, expect, it } from 'vitest';
import {
  GatheralSviEngine,
  calibrateSviSlice,
  computeDurrlemanG,
  computeSviFirstDerivative,
  computeSviImpliedVol,
  computeSviSecondDerivative,
  computeSviTotalVariance,
  evaluateArbitrageConditions,
  type SviCalibrationPoint,
  type SviRawParameters,
} from '../../../../src/desk/gatheralsvi';

describe('Gatheral (2004) SVI Smile Model', () => {
  const baseParams: SviRawParameters = {
    a: 0.04,
    b: 0.15,
    rho: -0.4,
    m: 0.02,
    sigma: 0.1,
  };
  const T = 0.5;

  describe('Mathematical SVI Formulations & Derivatives', () => {
    it('computes positive total variance w(k)', () => {
      for (const k of [-0.5, -0.2, 0.0, 0.2, 0.5]) {
        const w = computeSviTotalVariance(k, baseParams);
        expect(w).toBeGreaterThan(0);
        expect(Number.isFinite(w)).toBe(true);
      }
    });

    it('computes annualized implied volatility consistently with w(k)', () => {
      const k = 0.1;
      const w = computeSviTotalVariance(k, baseParams);
      const vol = computeSviImpliedVol(k, T, baseParams);
      expect(vol).toBeCloseTo(Math.sqrt(w / T), 6);
    });

    it('computes accurate first and second derivatives matching numerical differences', () => {
      const k = 0.05;
      const eps = 1e-5;

      const wPrime = computeSviFirstDerivative(k, baseParams);
      const numWPrime =
        (computeSviTotalVariance(k + eps, baseParams) -
          computeSviTotalVariance(k - eps, baseParams)) /
        (2 * eps);
      expect(wPrime).toBeCloseTo(numWPrime, 3);

      const wDoublePrime = computeSviSecondDerivative(k, baseParams);
      const numWDoublePrime =
        (computeSviTotalVariance(k + eps, baseParams) -
          2 * computeSviTotalVariance(k, baseParams) +
          computeSviTotalVariance(k - eps, baseParams)) /
        (eps * eps);
      expect(wDoublePrime).toBeCloseTo(numWDoublePrime, 3);
    });

    it('evaluates Durrleman butterfly arbitrage condition g(k)', () => {
      const g0 = computeDurrlemanG(0.0, baseParams);
      expect(Number.isFinite(g0)).toBe(true);

      const diag = evaluateArbitrageConditions(baseParams, T);
      expect(diag.wingSlopeFeasible).toBe(true);
      expect(Number.isFinite(diag.minButterflyG)).toBe(true);
    });
  });

  describe('SVI Calibration', () => {
    // Typical equity/crypto skew: downward sloping implied volatility
    const strikes = [80, 90, 95, 100, 105, 110, 120];
    const forward = 100;
    const marketVols = [0.32, 0.27, 0.24, 0.22, 0.21, 0.205, 0.215];

    it('calibrates to market smile slice with bounded error', () => {
      const points: SviCalibrationPoint[] = strikes.map((K, i) => ({
        logMoneyness: Math.log(K / forward),
        marketVol: marketVols[i],
      }));

      const fit = calibrateSviSlice(points, T);
      expect(fit.pointCount).toBe(points.length);
      expect(fit.params.b).toBeGreaterThan(0);
      expect(fit.params.sigma).toBeGreaterThan(0);
      expect(fit.rmseVol).toBeLessThan(0.06); // Vol error under 6 vol points
    });

    it('throws error when fewer than 3 calibration points provided', () => {
      const badPoints: SviCalibrationPoint[] = [
        { logMoneyness: -0.1, marketVol: 0.2 },
        { logMoneyness: 0.1, marketVol: 0.2 },
      ];
      expect(() => calibrateSviSlice(badPoints, T)).toThrow(
        'At least 3 calibration points required for SVI calibration',
      );
    });
  });

  describe('GatheralSviEngine Workflow', () => {
    const strikes = [80, 90, 100, 110, 120];
    const forward = 100;
    const marketVols = [0.30, 0.26, 0.22, 0.21, 0.22];

    it('fits from raw strikes and interpolates smile across continuum', () => {
      const engine = new GatheralSviEngine(T, forward);
      const fit = engine.fitFromStrikes(strikes, marketVols);

      expect(fit.pointCount).toBe(5);
      expect(engine.getModel()).toBe(fit);

      // ATM vol interpolation
      const atmVol = engine.getImpliedVolAtStrike(100);
      expect(atmVol).toBeGreaterThan(0.15);
      expect(atmVol).toBeLessThan(0.35);

      // Skew and curvature evaluation
      const skew = engine.getSkewSlope(0.0);
      const curve = engine.getCurvature(0.0);
      expect(Number.isFinite(skew)).toBe(true);
      expect(Number.isFinite(curve)).toBe(true);

      // Diagnostics check
      const diag = engine.runDiagnostics();
      expect(typeof diag.isButterflyArbitrageFree).toBe('boolean');
    });

    it('throws when getting parameters before fitting', () => {
      const engine = new GatheralSviEngine(T, forward);
      expect(() => engine.getParameters()).toThrow(
        'SVI model must be fitted first via fit() or fitFromStrikes()',
      );
    });
  });
});
