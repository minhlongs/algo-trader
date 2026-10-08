import { describe, expect, it } from 'vitest';
import { SabrEngine } from '../../../../src/desk/sabr/sabr-engine';

describe('SABR Volatility Model (Desk 106)', () => {
  it('should output ATM volatility accurately when Strike equals Forward', () => {
    const params = {
      forward: 100,
      strike: 100,
      timeToExpiry: 1.0,
      alpha: 0.2, // ~ 20% initial vol at CEV=1
      beta: 1.0,  // Lognormal
      rho: -0.5,
      nu: 0.4
    };

    const result = SabrEngine.calculateImpliedVolatility(params);
    expect(result.isValid).toBe(true);
    expect(result.impliedVolatility).toBeGreaterThan(0.18);
    expect(result.impliedVolatility).toBeLessThan(0.22);
    expect(result.z).toBeCloseTo(0.0, 5);
  });

  it('should form a volatility skew when rho is negative', () => {
    const base = { forward: 100, timeToExpiry: 1.0, alpha: 0.2, beta: 1.0, rho: -0.5, nu: 0.4 };
    
    // OTM Call (High strike)
    const volHigh = SabrEngine.calculateImpliedVolatility({ ...base, strike: 120 });
    // OTM Put (Low Strike)
    const volLow = SabrEngine.calculateImpliedVolatility({ ...base, strike: 80 });

    // Negative rho -> Left skew (Put vol > Call vol)
    expect(volLow.impliedVolatility).toBeGreaterThan(volHigh.impliedVolatility);
  });
});
