import { describe, expect, it } from 'vitest';
import { HestonEngine } from '../../../../src/desk/heston/heston-engine';

describe('Heston (1993) Stochastic Volatility (Desk 105)', () => {
  it('should compute valid call and put prices via numerical integration of CF', () => {
    // Standard European Call test case
    const model = {
      S0: 100,
      v0: 0.04,  // 20% volatility
      kappa: 2.0,
      theta: 0.04,
      sigma: 0.1, // vol of vol
      rho: -0.7,  // leverage effect
      r: 0.03,
      q: 0.0
    };

    const callOption = { strike: 100, timeToMaturity: 1.0, isCall: true };
    const putOption = { ...callOption, isCall: false };

    const callPrice = HestonEngine.calculateEuropeanOption(model, callOption);
    const putPrice = HestonEngine.calculateEuropeanOption(model, putOption);

    expect(callPrice).toBeGreaterThan(0);
    expect(putPrice).toBeGreaterThan(0);
    
    // Put-Call Parity check: C - P = S*e^{-qT} - K*e^{-rT}
    const parity = callPrice - putPrice;
    const expectedParity = model.S0 * Math.exp(-model.q * 1.0) - callOption.strike * Math.exp(-model.r * 1.0);
    expect(parity).toBeCloseTo(expectedParity, 5);
  });

  it('should generate higher OTM put prices for higher vol-of-vol driven by negative skew', () => {
    const model1 = { S0: 100, v0: 0.04, kappa: 1.0, theta: 0.04, sigma: 0.1, rho: -0.5, r: 0.05, q: 0.0 };
    const model2 = { ...model1, sigma: 0.8 }; // Much higher vol-of-vol

    // Use Out-of-The-Money (OTM) Put to clearly test fat-left-tail (skew) premium
    const option = { strike: 80, timeToMaturity: 1.0, isCall: false };

    const price1 = HestonEngine.calculateEuropeanOption(model1, option);
    const price2 = HestonEngine.calculateEuropeanOption(model2, option);

    // Fat left tails (due to negative rho combined with high vol-of-vol) lead to higher prices for OTM Puts
    expect(price2).toBeGreaterThan(price1);
  });
});
