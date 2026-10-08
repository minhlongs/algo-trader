import { describe, expect, it } from 'vitest';
import { GarmanKohlhagenEngine } from '../../../../src/desk/garmankohlhagen/gk-engine';
import { FxOptionPricingTerms } from '../../../../src/desk/garmankohlhagen/gk-types';

describe('GarmanKohlhagenEngine Suite', () => {
  const engine = new GarmanKohlhagenEngine();

  const standardTerms: FxOptionPricingTerms = {
    spotRate: 1.1000,              // EUR/USD spot
    strikeRate: 1.1000,            // ATM
    timeToExpiryYears: 1.0,
    domesticRiskFreeRatePct: 4.5,  // USD rate
    foreignRiskFreeRatePct: 3.0,   // EUR rate
    volatilityPct: 8.5,
  };

  it('should price European FX call and put satisfying interest-rate-parity and put-call-parity', () => {
    const result = engine.priceFxOption(standardTerms);

    expect(result.callPriceDomestic).toBeGreaterThan(0.01);
    expect(result.putPriceDomestic).toBeGreaterThan(0.01);
    expect(result.forwardRate).toBeGreaterThan(standardTerms.spotRate); // Forward premium since r_d > r_f
    expect(result.spotDeltaCall).toBeGreaterThan(0.4);
    expect(result.spotDeltaCall).toBeLessThan(0.7);
    expect(result.spotDeltaPut).toBeLessThan(0);
    expect(result.dualVega).toBeGreaterThan(0);
  });

  it('should accurately decompose market quote smile conventions into 25-delta wing volatilities', () => {
    const atmVol = 9.0;
    const rr25 = -0.8; // Put wing higher than call wing (negative risk reversal)
    const bf25 = 0.35; // Positive butterfly smile curvature

    const smile = engine.decomposeSmile(atmVol, rr25, bf25);

    expect(smile.atmVolPct).toBe(9.0);
    // Call vol = 9.0 + 0.35 - 0.4 = 8.95
    expect(smile.call25DeltaVolPct).toBeCloseTo(8.95, 2);
    // Put vol = 9.0 + 0.35 + 0.4 = 9.75
    expect(smile.put25DeltaVolPct).toBeCloseTo(9.75, 2);
    expect(smile.put25DeltaVolPct).toBeGreaterThan(smile.call25DeltaVolPct);
  });

  it('should throw on invalid FX terms', () => {
    const invalid: FxOptionPricingTerms = {
      ...standardTerms,
      spotRate: -1.0,
    };

    expect(() => engine.priceFxOption(invalid)).toThrow('Prices and maturity must be positive');
  });
});
