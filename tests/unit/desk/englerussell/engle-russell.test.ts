import { describe, expect, it } from 'vitest';
import {
  EngleRussellAcdEngine,
  computeAcdLogLikelihood,
  computeConditionalDurations,
  computeLjungBoxQ,
  estimateAcd11,
  logGamma,
  type TradeDurationEvent,
} from '../../../../src/desk/englerussell';

describe('Engle-Russell (1998) ACD Model', () => {
  // Synthetic clustered duration series (volatility clustering of transaction time)
  const syntheticDurations: number[] = [
    1.2, 0.8, 0.5, 0.4, 0.6, 1.1, 1.5, 3.2, 4.5, 5.1,
    4.0, 3.8, 2.1, 1.0, 0.7, 0.5, 0.4, 0.3, 0.5, 0.9,
    1.8, 2.5, 3.0, 2.8, 1.9, 1.2, 0.9, 0.6, 0.4, 0.5,
  ];

  describe('Mathematical & Statistical Helpers', () => {
    it('computes logGamma with high accuracy', () => {
      // Gamma(1) = 1 => logGamma(1) = 0
      expect(logGamma(1)).toBeCloseTo(0, 4);
      // Gamma(2) = 1 => logGamma(2) = 0
      expect(logGamma(2)).toBeCloseTo(0, 4);
      // Gamma(3) = 2 => logGamma(3) = ln(2) ~ 0.693147
      expect(logGamma(3)).toBeCloseTo(Math.log(2), 4);
      // Gamma(0.5) = sqrt(pi) => logGamma(0.5) = 0.5 * ln(pi)
      expect(logGamma(0.5)).toBeCloseTo(0.5 * Math.log(Math.PI), 4);
    });

    it('computes conditional duration recursion strictly positive', () => {
      const psi = computeConditionalDurations(syntheticDurations, 0.2, 0.1, 0.8);
      expect(psi.length).toBe(syntheticDurations.length);
      for (const p of psi) {
        expect(p).toBeGreaterThan(0);
        expect(Number.isFinite(p)).toBe(true);
      }
    });

    it('computes log-likelihood for Exponential and Weibull innovations', () => {
      const llExp = computeAcdLogLikelihood(syntheticDurations, 0.2, 0.1, 0.8, 'exponential');
      expect(Number.isFinite(llExp)).toBe(true);
      expect(llExp).toBeLessThan(0);

      const llWeibull = computeAcdLogLikelihood(
        syntheticDurations,
        0.2,
        0.1,
        0.8,
        'weibull',
        1.2,
      );
      expect(Number.isFinite(llWeibull)).toBe(true);
      expect(llWeibull).toBeLessThan(0);
    });

    it('computes Ljung-Box Q statistic on standardized residuals', () => {
      const psi = computeConditionalDurations(syntheticDurations, 0.2, 0.1, 0.8);
      const qStat = computeLjungBoxQ(syntheticDurations, psi, 5);
      expect(qStat).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(qStat)).toBe(true);
    });
  });

  describe('QMLE Estimation for ACD(1,1)', () => {
    it('fits ACD(1,1) with exponential innovations and stationary persistence', () => {
      const fit = estimateAcd11(syntheticDurations, { distribution: 'exponential' });

      expect(fit.sampleSize).toBe(syntheticDurations.length);
      expect(fit.omega).toBeGreaterThan(0);
      expect(fit.alpha[0]).toBeGreaterThan(0);
      expect(fit.beta[0]).toBeGreaterThan(0);
      expect(fit.persistence).toBeLessThan(1.0); // Stationarity condition
      expect(fit.unconditionalMeanDuration).toBeGreaterThan(0);
      expect(fit.logLikelihood).toBeLessThan(0);
      expect(fit.aic).toBeGreaterThan(0);
      expect(fit.bic).toBeGreaterThan(0);
    });

    it('fits ACD(1,1) with Weibull innovations', () => {
      const fit = estimateAcd11(syntheticDurations, {
        distribution: 'weibull',
        shapeGamma: 1.15,
      });

      expect(fit.shapeGamma).toBe(1.15);
      expect(fit.persistence).toBeLessThan(1.0);
      expect(Number.isFinite(fit.logLikelihood)).toBe(true);
    });

    it('throws error when durations sample size is under 5', () => {
      expect(() => estimateAcd11([1.0, 2.0, 3.0])).toThrow(
        'At least 5 duration observations required for ACD estimation',
      );
    });
  });

  describe('EngleRussellAcdEngine Forecasting & Regime Identification', () => {
    it('fits from raw trade duration events and returns model diagnostics', () => {
      const events: TradeDurationEvent[] = syntheticDurations.map((d, i) => ({
        timestamp: 1700000000000 + i * 1000,
        duration: d,
        volume: 100 + i * 5,
        price: 50000 + Math.sin(i) * 20,
      }));

      const engine = new EngleRussellAcdEngine({
        pOrder: 1,
        qOrder: 1,
        distribution: 'exponential',
      });

      const fit = engine.fitFromEvents(events);
      expect(fit.sampleSize).toBe(events.length);
      expect(engine.getModel()).toBe(fit);
    });

    it('forecasts multi-step conditional durations and arrival intensities', () => {
      const engine = new EngleRussellAcdEngine({
        pOrder: 1,
        qOrder: 1,
        distribution: 'exponential',
      });
      engine.fit(syntheticDurations);

      const forecast = engine.forecast(5);
      expect(forecast.horizonSteps).toBe(5);
      expect(forecast.forecastDurations.length).toBe(5);
      expect(forecast.arrivalIntensity.length).toBe(5);

      // Durations should be positive, intensity = 1 / duration
      for (let i = 0; i < 5; i++) {
        expect(forecast.forecastDurations[i]).toBeGreaterThan(0);
        expect(forecast.arrivalIntensity[i]).toBeCloseTo(
          1 / forecast.forecastDurations[i],
          3,
        );
      }

      expect(['rapid', 'normal', 'dormant']).toContain(forecast.speedRegime);
    });

    it('updates online conditionally on new trade transaction arrival', () => {
      const engine = new EngleRussellAcdEngine({
        pOrder: 1,
        qOrder: 1,
        distribution: 'exponential',
      });
      engine.fit(syntheticDurations);

      const updatedPsi = engine.updateOnline(0.25); // fast trade arrival
      expect(updatedPsi).toBeGreaterThan(0);
      expect(Number.isFinite(updatedPsi)).toBe(true);

      const forecastFast = engine.forecast(3);
      expect(forecastFast.forecastDurations[0]).toBeGreaterThan(0);
    });

    it('throws when forecast called before fitting', () => {
      const engine = new EngleRussellAcdEngine({
        pOrder: 1,
        qOrder: 1,
        distribution: 'exponential',
      });
      expect(() => engine.forecast()).toThrow('ACD model must be fitted first via fit()');
    });
  });
});
