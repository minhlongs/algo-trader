import { describe, expect, it } from 'vitest';
import { MertonYieldEngine } from '../../../../src/desk/merton/merton-yield-engine';
import { MertonYieldOptionParameters } from '../../../../src/desk/merton/merton-yield-types';

describe('MertonYieldEngine Suite (Desk 83)', () => {
  const engine = new MertonYieldEngine();

  const standardParams: MertonYieldOptionParameters = {
    spotPrice: 100.0,
    strikePrice: 100.0,
    timeToExpiryYears: 1.0,
    riskFreeRatePct: 5.0,
    continuousDividendYieldPct: 2.0, // 2% dividend yield
    volatilityPct: 20.0,
  };

  it('should price European options with continuous dividend yield and verify put-call parity', () => {
    const res = engine.priceOption(standardParams);

    expect(res.callPrice).toBeGreaterThan(0.0);
    expect(res.putPrice).toBeGreaterThan(0.0);
    expect(res.forwardPrice).toBeCloseTo(100.0 * Math.exp(0.03 * 1.0), 2);

    // Generalized Put-Call Parity: C - P = S * e^(-q*tau) - K * e^(-r*tau)
    const discQ = Math.exp(-0.02 * 1.0);
    const discR = Math.exp(-0.05 * 1.0);
    const expectedDiff = standardParams.spotPrice * discQ - standardParams.strikePrice * discR;
    const actualDiff = res.callPrice - res.putPrice;

    expect(Math.abs(actualDiff - expectedDiff)).toBeLessThan(0.01);
  });

  it('should compute exact Greeks sensitivities adhering to directional properties', () => {
    const res = engine.priceOption(standardParams);
    const g = res.greeks;

    expect(g.callDelta).toBeGreaterThan(0.0);
    expect(g.callDelta).toBeLessThan(1.0);
    expect(g.putDelta).toBeLessThan(0.0);
    expect(g.putDelta).toBeGreaterThan(-1.0);
    expect(g.gamma).toBeGreaterThan(0.0);
    expect(g.vega).toBeGreaterThan(0.0);
    expect(g.callTheta).toBeLessThan(0.0); // Time decay negative for standard long call
    expect(g.callRho).toBeGreaterThan(0.0);
    expect(g.putRho).toBeLessThan(0.0);
    expect(g.callDividendRhoPhi).toBeLessThan(0.0); // Dividend hurts call value
    expect(g.putDividendRhoPhi).toBeGreaterThan(0.0); // Dividend helps put value
  });

  it('should throw when spot, strike or volatility are non-positive', () => {
    expect(() =>
      engine.priceOption({
        ...standardParams,
        spotPrice: -10.0,
      })
    ).toThrow('Spot and strike prices must be strictly positive');

    expect(() =>
      engine.priceOption({
        ...standardParams,
        volatilityPct: 0.0,
      })
    ).toThrow('Volatility must be strictly positive');
  });
});
