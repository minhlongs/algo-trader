import { describe, expect, it } from 'vitest';
import { SabrVolatilityEngine } from '../../../../src/desk/sabr/sabr-volatility-engine';
import { SabrEvaluationRequest, SabrParameters } from '../../../../src/desk/sabr/sabr-types';

describe('SabrVolatilityEngine Suite', () => {
  const engine = new SabrVolatilityEngine();

  const standardParams: SabrParameters = {
    alpha: 0.20,
    beta: 0.50,
    rho: -0.25,
    nu: 0.40,
  };

  it('should accurately calculate ATM implied volatility with expansion formula', () => {
    const request: SabrEvaluationRequest = {
      forwardPrice: 100.0,
      strikePrice: 100.0,
      timeToExpiryYears: 1.0,
      parameters: standardParams,
    };

    const result = engine.calculateImpliedVolatility(request);

    expect(result.isAtm).toBe(true);
    expect(result.impliedVolPct).toBeGreaterThan(0.01);
    expect(result.forwardPrice).toBe(100.0);
    expect(result.strikePrice).toBe(100.0);
  });

  it('should compute non-ATM implied volatility reproducing volatility skew', () => {
    // Negative rho should produce negative skew (higher OTM puts / lower strikes have higher vol)
    const otmPutRequest: SabrEvaluationRequest = {
      forwardPrice: 100.0,
      strikePrice: 85.0,
      timeToExpiryYears: 1.0,
      parameters: standardParams,
    };

    const otmCallRequest: SabrEvaluationRequest = {
      forwardPrice: 100.0,
      strikePrice: 115.0,
      timeToExpiryYears: 1.0,
      parameters: standardParams,
    };

    const putVol = engine.calculateImpliedVolatility(otmPutRequest);
    const callVol = engine.calculateImpliedVolatility(otmCallRequest);

    expect(putVol.isAtm).toBe(false);
    expect(callVol.isAtm).toBe(false);
    // Skew validation: with negative rho, lower strike has higher implied vol
    expect(putVol.impliedVolPct).toBeGreaterThan(callVol.impliedVolPct);
  });

  it('should reject invalid model parameters', () => {
    const invalidRequest: SabrEvaluationRequest = {
      forwardPrice: 100.0,
      strikePrice: 100.0,
      timeToExpiryYears: 1.0,
      parameters: {
        ...standardParams,
        rho: 1.5, // Invalid correlation
      },
    };

    expect(() => engine.calculateImpliedVolatility(invalidRequest)).toThrow(
      'Rho correlation must be in [-1, 1]'
    );
  });
});
