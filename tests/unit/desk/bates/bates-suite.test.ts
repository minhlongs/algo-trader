import { describe, expect, it } from 'vitest';
import { BatesEngine } from '../../../../src/desk/bates/bates-engine';
import { BatesParams, BatesOptionParams } from '../../../../src/desk/bates/bates-types';

describe('Bates (1996) Stochastic Volatility Jump-Diffusion Suite (Desk 108)', () => {
  const modelParams: BatesParams = {
    spotPrice: 100,
    initialVariance: 0.04,  // 20% vol
    kappa: 2.0,             // mean reversion speed
    theta: 0.04,            // long-term variance
    volOfVol: 0.3,          // sigma_v
    rho: -0.5,              // negative correlation between stock and vol
    riskFreeRate: 0.05,
    dividendYield: 0.0,
    jumpIntensity: 0.0,     // zero jumps -> standard Heston
    jumpMean: 0.0,          // mean jump size
    jumpVol: 0.1,           // jump vol
  };

  const callOption: BatesOptionParams = {
    strike: 100,
    timeToMaturity: 1.0,
    isCall: true,
  };

  it('should recover Heston price when jump intensity lambda = 0', () => {
    const price = BatesEngine.calculateEuropeanOption(modelParams, callOption);
    expect(price).toBeGreaterThan(0.0);
    // At ATM 1Y 20% vol, call price should be approx 10.45
    expect(price).toBeGreaterThan(9.0);
    expect(price).toBeLessThan(12.0);
  });

  it('should price Put via Put-Call parity', () => {
    const callPrice = BatesEngine.calculateEuropeanOption(modelParams, callOption);
    const putPrice = BatesEngine.calculateEuropeanOption(modelParams, { ...callOption, isCall: false });

    // Parity: C - P = S * exp(-q*T) - K * exp(-r*T)
    const expectedDiff = modelParams.spotPrice - callOption.strike * Math.exp(-modelParams.riskFreeRate * callOption.timeToMaturity);
    const actualDiff = callPrice - putPrice;

    expect(actualDiff).toBeCloseTo(expectedDiff, 1);
  });

  it('should elevate deep OTM put prices when negative jump intensity is introduced (crash risk)', () => {
    // Zero-jump baseline for deep OTM put (K = 70)
    const otmPut: BatesOptionParams = {
      strike: 70,
      timeToMaturity: 1.0,
      isCall: false,
    };
    const noJumpPrice = BatesEngine.calculateEuropeanOption(modelParams, otmPut);

    // Introduce negative jump intensity (1 jump/year on average, -15% mean jump)
    const jumpModel: BatesParams = {
      ...modelParams,
      jumpIntensity: 1.0,
      jumpMean: -0.15,
      jumpVol: 0.1,
    };
    const jumpPrice = BatesEngine.calculateEuropeanOption(jumpModel, otmPut);

    // Crash jumps must elevate OTM put prices significantly
    expect(jumpPrice).toBeGreaterThan(noJumpPrice);
  });
});
