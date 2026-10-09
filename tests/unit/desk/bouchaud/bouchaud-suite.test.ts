import { describe, it, expect } from 'vitest';
import { BouchaudEngine } from '../../../../src/desk/bouchaud/bouchaud-engine';
import { BouchaudMath } from '../../../../src/desk/bouchaud/bouchaud-math';

describe('BouchaudEngine — Empirical Power-Law Order Flow Impact Suite', () => {
  it('identifies efficient diffusive regime when beta = (1 - gamma) / 2', () => {
    const gamma = 0.5;
    const beta = (1.0 - gamma) / 2.0; // 0.25
    const signs = new Array(30).fill(1); // 30 successive buys

    const res = BouchaudEngine.calculate({
      orderSigns: signs,
      decayExponentBeta: beta,
      memoryExponentGamma: gamma,
    });

    expect(res.efficiencyRegime).toBe('EFFICIENT_DIFFUSIVE');
    expect(res.isArbitrageFree).toBe(true);
    expect(res.diffusiveCancellationError).toBeCloseTo(0.0, 6);
  });

  it('detects subdiffusive reversal regime when propagator decays too rapidly', () => {
    const gamma = 0.6;
    const beta = 0.5; // (1 - 0.6)/2 = 0.2, but beta = 0.5 > 0.25 => decays too fast
    const signs = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1];

    const res = BouchaudEngine.calculate({
      orderSigns: signs,
      decayExponentBeta: beta,
      memoryExponentGamma: gamma,
    });

    expect(res.efficiencyRegime).toBe('SUBDIFFUSIVE_REVERSAL');
    expect(res.isArbitrageFree).toBe(false);
    expect(res.diffusiveCancellationError).toBeCloseTo(0.3, 4);
  });

  it('detects superdiffusive trending regime when propagator decays too slowly', () => {
    const gamma = 0.4;
    const beta = 0.1; // (1 - 0.4)/2 = 0.3, but beta = 0.1 < 0.25 => persists too long
    const signs = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1];

    const res = BouchaudEngine.calculate({
      orderSigns: signs,
      decayExponentBeta: beta,
      memoryExponentGamma: gamma,
    });

    expect(res.efficiencyRegime).toBe('SUPERDIFFUSIVE_TRENDING');
    expect(res.isArbitrageFree).toBe(false);
  });

  it('verifies cumulative price impact sign matches net order flow', () => {
    const buyFlow = [1, 1, 1, 1, 1, 1, 1, 1];
    const sellFlow = [-1, -1, -1, -1, -1, -1, -1, -1];

    const resBuy = BouchaudEngine.calculate({
      orderSigns: buyFlow,
      decayExponentBeta: 0.3,
      memoryExponentGamma: 0.4,
    });

    const resSell = BouchaudEngine.calculate({
      orderSigns: sellFlow,
      decayExponentBeta: 0.3,
      memoryExponentGamma: 0.4,
    });

    expect(resBuy.cumulativePriceImpact).toBeGreaterThan(0.0);
    expect(resSell.cumulativePriceImpact).toBeLessThan(0.0);
    expect(resBuy.cumulativePriceImpact).toBeCloseTo(-resSell.cumulativePriceImpact, 6);
  });

  it('throws descriptive error on invalid exponents or empty order sequence', () => {
    expect(() =>
      BouchaudEngine.calculate({
        orderSigns: [1, -1],
        decayExponentBeta: -0.1, // Invalid beta <= 0
        memoryExponentGamma: 0.5,
      })
    ).toThrow('beta must be > 0 and gamma must be in (0, 1)');

    expect(() =>
      BouchaudEngine.calculate({
        orderSigns: [1, -1],
        decayExponentBeta: 0.25,
        memoryExponentGamma: 1.5, // Invalid gamma >= 1
      })
    ).toThrow('beta must be > 0 and gamma must be in (0, 1)');

    expect(() =>
      BouchaudEngine.calculate({
        orderSigns: [], // Invalid empty signs
        decayExponentBeta: 0.25,
        memoryExponentGamma: 0.5,
      })
    ).toThrow('orderSigns must be a non-empty array');
  });
});
