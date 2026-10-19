/**
 * Zero-mock unit test suite for Quantitative Desk Waves 205-207.
 *
 * Tests:
 * - Wave 205: Hansen & Lunde (2006) Realized Kernel
 * - Wave 206: Christensen, Oomen & Podolskij (2014) Realized Quantile Variance (RQV)
 * - Wave 207: Bollerslev, Gibson & Zhou (2011) Variance Risk Premium (VRP)
 *
 * Strictly < 180 LOC, zero mocks, zero :any.
 */

import { describe, it, expect } from 'vitest';
import { RealizedKernelEngine, RealizedKernelMath } from '../../../src/desk/realizedkernel';
import { RqvEngine, RqvMath } from '../../../src/desk/rqv';
import { VrpEngine, VrpMath, OptionQuote } from '../../../src/desk/vrp';

describe('Wave 205: Hansen & Lunde (2006) Realized Kernel', () => {
  it('evaluates kernel weights accurately for Parzen and Tukey-Hanning', () => {
    expect(RealizedKernelMath.evaluateKernelWeight(0.0, 'PARZEN')).toBe(1.0);
    expect(RealizedKernelMath.evaluateKernelWeight(0.5, 'PARZEN')).toBeCloseTo(0.25, 4);
    expect(RealizedKernelMath.evaluateKernelWeight(1.0, 'PARZEN')).toBe(0.0);
    expect(RealizedKernelMath.evaluateKernelWeight(0.0, 'TUKEY_HANNING')).toBe(1.0);
    expect(RealizedKernelMath.evaluateKernelWeight(1.0, 'TUKEY_HANNING')).toBe(0.0);
  });

  it('calculates noise-corrected realized kernel from high-frequency returns', () => {
    const engine = new RealizedKernelEngine({ kernelType: 'PARZEN', autoBandwidth: true });
    // Synthetic high frequency returns with bid-ask bounce noise
    const returns: number[] = [];
    let state = 0.001;
    for (let i = 0; i < 200; i++) {
      state = -state + 0.0002 * Math.sin(i);
      returns.push(state);
    }

    const res = engine.estimateFromReturns(returns);
    expect(res.sampleSize).toBe(200);
    expect(res.realizedVarianceRaw).toBeGreaterThan(0);
    expect(res.realizedKernelVariance).toBeGreaterThan(0);
    expect(res.optimalBandwidthH).toBeGreaterThanOrEqual(1);
    expect(res.autocovariances.length).toBe(res.optimalBandwidthH + 1);
  });
});

describe('Wave 206: Christensen, Oomen & Podolskij (2014) RQV', () => {
  it('computes Beasley-Springer-Moro normal inverse CDF and nu1 constant', () => {
    expect(RqvMath.normalInverseCdf(0.5)).toBeCloseTo(0.0, 4);
    expect(RqvMath.normalInverseCdf(0.8413447)).toBeCloseTo(1.0, 3);
    const nu1 = RqvMath.calculateNu1(0.85);
    expect(nu1).toBeGreaterThan(2.0);
  });

  it('separates continuous variance from simulated discrete price jumps', () => {
    const engine = new RqvEngine({ quantileAlpha: 0.85, blockLengthK: 5 });
    const returns: number[] = [];
    for (let i = 0; i < 150; i++) {
      returns.push(0.001 * Math.cos(i * 0.3));
    }
    // Inject discrete jump
    returns[75] = 0.08;

    const res = engine.estimateFromReturns(returns);
    expect(res.realizedVarianceTotal).toBeGreaterThan(res.realizedQuantileVarianceContinuous);
    expect(res.jumpVariance).toBeGreaterThan(0.001);
    expect(res.jumpFractionPct).toBeGreaterThan(10.0);
    expect(res.jumpTestStatisticZ).toBeGreaterThan(1.645);
    expect(res.hasSignificantJump).toBe(true);
  });
});

describe('Wave 207: Bollerslev, Gibson & Zhou (2011) VRP', () => {
  it('calculates model-free implied variance and HAR-RV expectation', () => {
    const quotes: OptionQuote[] = [
      { strike: 90, optionType: 'PUT', price: 1.2 },
      { strike: 95, optionType: 'PUT', price: 2.5 },
      { strike: 100, optionType: 'CALL', price: 4.8 },
      { strike: 105, optionType: 'CALL', price: 2.1 },
      { strike: 110, optionType: 'CALL', price: 0.9 },
    ];

    const mfiv = VrpMath.calculateModelFreeImpliedVariance(quotes, 100.0, 0.045, 30.0 / 365.0);
    expect(mfiv).toBeGreaterThan(0.01);

    const dailyRv = Array.from({ length: 30 }, (_, i) => 0.00015 + 0.00005 * Math.sin(i));
    const expRv = VrpMath.calculateHarExpectedVariance(dailyRv);
    expect(expRv).toBeGreaterThan(0.01);
  });

  it('evaluates variance risk premium and predicts excess equity returns', () => {
    const engine = new VrpEngine({ underlyingPrice: 100.0, forecastHorizonMonths: 3 });
    const quotes: OptionQuote[] = [
      { strike: 85, optionType: 'PUT', price: 0.8 },
      { strike: 90, optionType: 'PUT', price: 1.5 },
      { strike: 95, optionType: 'PUT', price: 2.8 },
      { strike: 100, optionType: 'CALL', price: 5.2 },
      { strike: 105, optionType: 'CALL', price: 2.4 },
      { strike: 110, optionType: 'CALL', price: 1.1 },
    ];
    const dailyRv = Array.from({ length: 30 }, () => 0.00012);

    const res = engine.evaluate(quotes, dailyRv);
    expect(res.varianceRiskPremium).toBeDefined();
    expect(res.riskPremiumRegime).toBeDefined();
    expect(res.predictedExcessReturnPct).toBeDefined();
    expect(res.tStatistic).toBeGreaterThan(2.0);
  });
});
