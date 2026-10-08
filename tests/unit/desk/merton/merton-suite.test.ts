import { describe, expect, it } from 'vitest';
import { MertonJumpEngine } from '../../../../src/desk/merton/merton-jump-engine';
import { MertonJumpDiffusionParameters } from '../../../../src/desk/merton/merton-types';

describe('MertonJumpEngine Suite', () => {
  const engine = new MertonJumpEngine();

  const standardParams: MertonJumpDiffusionParameters = {
    spotPrice: 100.0,
    strikePrice: 100.0,
    timeToExpiryYears: 0.5,
    riskFreeRatePct: 5.0,
    diffusionVolatilityPct: 20.0,
    jumpIntensityLambda: 0.75, // Approx 0.75 jumps/year
    meanJumpSizeMu: -0.05,     // Downward mean jump
    jumpVolatilityDelta: 0.15, // Jump dispersion
  };

  it('should price European option and isolate the jump contribution over pure Black-Scholes', () => {
    const result = engine.priceOption(standardParams);

    expect(result.callPriceUsd).toBeGreaterThan(0);
    expect(result.putPriceUsd).toBeGreaterThan(0);
    expect(result.blackScholesBenchmarkCallUsd).toBeGreaterThan(0);
    // Extra tail risk from Poisson jumps should elevate overall option price
    expect(result.callPriceUsd).toBeGreaterThan(result.blackScholesBenchmarkCallUsd);
    expect(result.jumpComponentContributionUsd).toBeGreaterThan(0);
    expect(result.truncatedPoissonTermsCount).toBeGreaterThan(1);
  });

  it('should converge to Black-Scholes when jump intensity lambda is zero', () => {
    const noJumpParams: MertonJumpDiffusionParameters = {
      ...standardParams,
      jumpIntensityLambda: 0.0,
    };

    const result = engine.priceOption(noJumpParams);

    expect(Math.abs(result.callPriceUsd - result.blackScholesBenchmarkCallUsd)).toBeLessThan(0.01);
    expect(Math.abs(result.jumpComponentContributionUsd)).toBeLessThan(0.01);
  });

  it('should throw when input spot or strike is non-positive', () => {
    const invalid: MertonJumpDiffusionParameters = {
      ...standardParams,
      spotPrice: -10.0,
    };

    expect(() => engine.priceOption(invalid)).toThrow('Prices and time to maturity must be positive');
  });
});
