import { describe, it, expect } from 'vitest';
import { BDTEngine } from '../../../../src/desk/bdt/bdt-engine.js';
import { BDTModelParams, EuropeanBDTBondOptionParams } from '../../../../src/desk/bdt/bdt-types.js';

describe('BDTEngine (1990 Log-Normal Short Rate Lattice)', () => {
  const model: BDTModelParams = {
    yieldCurve: [0.03, 0.035, 0.038, 0.040, 0.042],
    volatilities: [0.15, 0.15, 0.15, 0.15, 0.15],
    timeStep: 1.0,
  };

  it('validates yield curve and volatilities strictly', () => {
    expect(() => BDTEngine.calibrateLattice({ yieldCurve: [], volatilities: [0.1] })).toThrow();
    expect(() => BDTEngine.calibrateLattice({ yieldCurve: [-0.01], volatilities: [0.1] })).toThrow();
    expect(() => BDTEngine.calibrateLattice({ yieldCurve: [0.03], volatilities: [-0.1] })).toThrow();
  });

  it('calibrates lattice correctly and recovers input zero-coupon bond prices', () => {
    const lattice = BDTEngine.calibrateLattice(model);

    expect(lattice.steps).toBe(5);
    expect(lattice.rates.length).toBe(5);

    // Tree rates at each level should be strictly ascending with state
    for (let step = 0; step < lattice.steps; step++) {
      const stepRates = lattice.rates[step];
      expect(stepRates.length).toBe(step + 1);
      for (let j = 0; j < step; j++) {
        expect(stepRates[j + 1]).toBeGreaterThan(stepRates[j]);
      }
    }

    // Recovered ZCB prices must match theoretical discount factors:
    for (let maturity = 1; maturity <= lattice.steps; maturity++) {
      const modelPrice = BDTEngine.priceZCB(lattice, maturity);
      const targetDiscount = lattice.discountFactors[maturity - 1];
      expect(Math.abs(modelPrice - targetDiscount)).toBeLessThan(1e-4);
    }
  });

  it('prices European call and put options on zero coupon bonds correctly', () => {
    const lattice = BDTEngine.calibrateLattice(model);
    const optionParams: EuropeanBDTBondOptionParams = {
      optionMaturityStep: 2,
      bondMaturityStep: 4,
      strikePrice: 0.90,
      isCall: true,
    };

    const callResult = BDTEngine.priceBondOption(lattice, optionParams);
    const putResult = BDTEngine.priceBondOption(lattice, { ...optionParams, isCall: false });

    expect(callResult.optionPrice).toBeGreaterThan(0);
    expect(putResult.optionPrice).toBeGreaterThan(0);
    expect(callResult.underlyingBondPrice).toBeGreaterThan(0);
    expect(callResult.underlyingBondPrice).toBeLessThan(1.0);
  });
});
