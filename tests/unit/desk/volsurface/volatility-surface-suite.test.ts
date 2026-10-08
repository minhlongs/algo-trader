import { describe, it, expect } from 'vitest';
import { SviCalibrator } from '../../../../src/desk/volsurface/svi-calibrator';
import { DupireLocalVolPricer } from '../../../../src/desk/volsurface/dupire-local-vol-pricer';
import { CalendarButterflyArbitrageDetector } from '../../../../src/desk/volsurface/calendar-butterfly-arbitrage-detector';
import { SviParameters, VolatilitySlicePoint } from '../../../../src/desk/volsurface/volsurface-types';

describe('Volatility Surface Arbitrage Desk Suite', () => {
  describe('SviCalibrator', () => {
    const validParams: SviParameters = {
      a: 0.04,
      b: 0.08,
      rho: -0.35,
      m: 0.02,
      sigma: 0.12,
    };

    it('evaluates total variance and first/second derivatives', () => {
      const calibrator = new SviCalibrator();
      const w0 = calibrator.evaluateTotalVariance(0.0, validParams);
      const w1 = calibrator.evaluateFirstDerivative(0.0, validParams);
      const w2 = calibrator.evaluateSecondDerivative(0.0, validParams);

      expect(w0).toBeGreaterThan(0);
      expect(w2).toBeGreaterThan(0); // Curvature must be positive
      expect(typeof w1).toBe('number');
    });

    it('calibrates SVI parameters to a slice of strike observations', () => {
      const calibrator = new SviCalibrator();

      // Synthetic slice around ATM F = 100, T = 1.0
      const strikes = [80, 90, 95, 100, 105, 110, 120];
      const slice: VolatilitySlicePoint[] = strikes.map((K) => {
        const k = Math.log(K / 100);
        const w = calibrator.evaluateTotalVariance(k, validParams);
        return {
          strike: K,
          forward: 100,
          logMoneyness: k,
          impliedVol: Math.sqrt(w),
          totalVariance: w,
        };
      });

      const fit = calibrator.calibrateSlice(slice);

      expect(fit.rmse).toBeLessThan(0.01);
      expect(fit.noButterflyArbitrage).toBe(true);
      expect(fit.parameters.b).toBeGreaterThan(0);
      expect(Math.abs(fit.parameters.rho)).toBeLessThan(1);
    });
  });

  describe('DupireLocalVolPricer', () => {
    it('computes positive local volatility between consecutive term slices', () => {
      const pricer = new DupireLocalVolPricer();

      const nearSlice = {
        expiryYears: 0.5,
        forward: 100,
        sviParams: { a: 0.02, b: 0.05, rho: -0.3, m: 0.0, sigma: 0.1 },
      };

      const farSlice = {
        expiryYears: 1.0,
        forward: 102,
        sviParams: { a: 0.04, b: 0.08, rho: -0.3, m: 0.0, sigma: 0.12 },
      };

      const localVolAtm = pricer.computeLocalVolatility(100, nearSlice, farSlice);
      const localVolOtm = pricer.computeLocalVolatility(110, nearSlice, farSlice);

      expect(localVolAtm).toBeGreaterThan(0.05);
      expect(localVolAtm).toBeLessThan(1.0);
      expect(localVolOtm).toBeGreaterThan(0.05);
    });

    it('throws error if far expiry is not greater than near expiry', () => {
      const pricer = new DupireLocalVolPricer();
      expect(() =>
        pricer.computeLocalVolatility(
          100,
          { expiryYears: 1.0, forward: 100, sviParams: { a: 0.04, b: 0.1, rho: 0, m: 0, sigma: 0.1 } },
          { expiryYears: 0.5, forward: 100, sviParams: { a: 0.02, b: 0.1, rho: 0, m: 0, sigma: 0.1 } }
        )
      ).toThrow('strictly greater');
    });
  });

  describe('CalendarButterflyArbitrageDetector', () => {
    it('detects absence of butterfly arbitrage on well-behaved SVI params', () => {
      const detector = new CalendarButterflyArbitrageDetector();
      const params: SviParameters = { a: 0.04, b: 0.08, rho: -0.2, m: 0.0, sigma: 0.15 };

      const res = detector.checkButterflyArbitrage(params);
      expect(res.hasButterflyArbitrage).toBe(false);
      expect(res.minDurrlemanValue).toBeGreaterThanOrEqual(0);
    });

    it('detects calendar arbitrage when far slice variance is lower than near slice', () => {
      const detector = new CalendarButterflyArbitrageDetector();
      const nearParams: SviParameters = { a: 0.08, b: 0.1, rho: -0.2, m: 0.0, sigma: 0.1 };
      const invertedFarParams: SviParameters = { a: 0.02, b: 0.05, rho: -0.2, m: 0.0, sigma: 0.1 };

      const res = detector.checkCalendarArbitrage(nearParams, invertedFarParams);
      expect(res.hasCalendarArbitrage).toBe(true);
      expect(res.violationPoints.length).toBeGreaterThan(0);
    });
  });
});
