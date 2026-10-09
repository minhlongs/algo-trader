import { describe, it, expect } from 'vitest';
import { HasbrouckEngine } from '../../../../src/desk/hasbrouckvar/hasbrouck-engine.js';
import { HasbrouckObservation, HasbrouckParams } from '../../../../src/desk/hasbrouckvar/hasbrouck-types.js';

describe('Hasbrouck (1991) Vector Autoregressive (VAR) Microstructure Engine', () => {
  const params: HasbrouckParams = { lags: 2 };

  // Generate synthetic sequence where trade sign positively drives quote revisions
  const generateData = (n: number, impact: number): HasbrouckObservation[] => {
    const data: HasbrouckObservation[] = [];
    let prevTrade = 0;
    for (let i = 0; i < n; i++) {
      // Trade sign autocorrelation
      const trade = Math.random() < 0.6 ? (Math.random() < 0.5 ? 1 : -1) : 0;
      const noise = (Math.random() - 0.5) * 0.1;
      const quoteRevision = impact * trade + 0.2 * prevTrade + noise;
      data.push({ quoteRevision, tradeSign: trade });
      prevTrade = trade;
    }
    return data;
  };

  it('estimates positive contemporary price impact beta0 from buyer/seller order flow', () => {
    const obs = generateData(200, 0.5);
    const result = HasbrouckEngine.estimate(obs, params);

    expect(result.varCoefficients.betaZero).toBeGreaterThan(0.2);
    expect(result.permanentPriceImpact).toBeGreaterThan(0);
  });

  it('calculates information share strictly bounded within [0, 1]', () => {
    const obs = generateData(200, 0.4);
    const result = HasbrouckEngine.estimate(obs, params);

    expect(result.informationShare).toBeGreaterThanOrEqual(0);
    expect(result.informationShare).toBeLessThanOrEqual(1.0);
    expect(result.totalVariance).toBeGreaterThan(0);
    expect(result.tradeRelatedVariance).toBeGreaterThan(0);
  });

  it('yields higher information share when trade impact increases', () => {
    const lowImpactData = generateData(300, 0.05);
    const highImpactData = generateData(300, 0.8);

    const lowRes = HasbrouckEngine.estimate(lowImpactData, params);
    const highRes = HasbrouckEngine.estimate(highImpactData, params);

    expect(highRes.permanentPriceImpact).toBeGreaterThan(lowRes.permanentPriceImpact);
    expect(highRes.tradeRelatedVariance).toBeGreaterThan(lowRes.tradeRelatedVariance);
  });

  it('correctly tracks lag dimensions in VAR matrices', () => {
    const obs = generateData(100, 0.3);
    const res3Lags = HasbrouckEngine.estimate(obs, { lags: 3 });

    expect(res3Lags.lags).toBe(3);
    expect(res3Lags.varCoefficients.alphaLags.length).toBe(3);
    expect(res3Lags.varCoefficients.betaLags.length).toBe(3);
    expect(res3Lags.varCoefficients.gammaLags.length).toBe(3);
    expect(res3Lags.varCoefficients.phiLags.length).toBe(3);
  });

  it('validates minimum sample size and integer lags', () => {
    expect(() => HasbrouckEngine.estimate([], params)).toThrow(/at least/);
    expect(() => HasbrouckEngine.estimate(generateData(20, 0.2), { lags: 0 })).toThrow(/>= 1/);
    expect(() => HasbrouckEngine.estimate(generateData(20, 0.2), { lags: 1.5 })).toThrow(/integer/);
  });
});
