import { describe, expect, it } from 'vitest';
import { DuffieSingletonEngine } from '../../../../src/desk/duffiesingleton/duffie-singleton-engine';
import { DuffieSingletonParams } from '../../../../src/desk/duffiesingleton/duffie-singleton-types';
import { DuffieSingletonMath } from '../../../../src/desk/duffiesingleton/duffie-singleton-math';

describe('Duffie-Singleton (1999) Reduced-Form Credit Risk Suite (Desk 118)', () => {
  const baseParams: DuffieSingletonParams = {
    riskFreeRate: 0.04,         // 4% risk-free rate
    currentIntensity: 0.02,     // 200 bps initial default hazard rate
    meanReversion: 0.3,         // Reversion speed kappa
    longTermIntensity: 0.035,   // 350 bps long-term mean hazard rate
    volatility: 0.05,           // 5% hazard volatility
    lossGivenDefault: 0.60,     // 60% fractional loss (40% recovery)
    maturities: [1.0, 2.0, 3.0, 5.0, 7.0, 10.0],
  };

  it('should generate valid term structure with positive spreads and decreasing survival probabilities', () => {
    const result = DuffieSingletonEngine.calculate(baseParams);

    expect(result.curve).toHaveLength(6);
    expect(result.instantaneousSpreadBps).toBeCloseTo(0.02 * 0.60 * 10000, 3);
    expect(result.longTermSpreadBps).toBeCloseTo(0.035 * 0.60 * 10000, 3);
    expect(result.fellerConditionSatisfied).toBe(true);

    let prevSurvival = 1.0;
    for (const point of result.curve) {
      expect(point.defaultableBondPrice).toBeLessThan(point.defaultFreeBondPrice);
      expect(point.defaultableBondPrice).toBeGreaterThan(0.0);
      expect(point.creditSpreadBps).toBeGreaterThan(0.0);
      expect(point.survivalProbability).toBeLessThan(prevSurvival);
      expect(point.survivalProbability).toBeGreaterThan(0.0);
      expect(point.cumulativeDefaultProb).toBeCloseTo(1.0 - point.survivalProbability, 5);
      expect(point.parCdsSpreadBps).toBeGreaterThan(0.0);
      prevSurvival = point.survivalProbability;
    }
  });

  it('should widen credit spreads and CDS spreads when hazard intensity or LGD increases', () => {
    const baseResult = DuffieSingletonEngine.calculate(baseParams);

    const highHazardParams: DuffieSingletonParams = {
      ...baseParams,
      currentIntensity: 0.06, // 600 bps initial hazard
    };
    const highHazardResult = DuffieSingletonEngine.calculate(highHazardParams);

    expect(highHazardResult.curve[0].creditSpreadBps).toBeGreaterThan(baseResult.curve[0].creditSpreadBps);
    expect(highHazardResult.curve[0].parCdsSpreadBps).toBeGreaterThan(baseResult.curve[0].parCdsSpreadBps);
    expect(highHazardResult.curve[0].survivalProbability).toBeLessThan(baseResult.curve[0].survivalProbability);

    const highLgdParams: DuffieSingletonParams = {
      ...baseParams,
      lossGivenDefault: 0.90, // 90% loss
    };
    const highLgdResult = DuffieSingletonEngine.calculate(highLgdParams);
    expect(highLgdResult.curve[0].creditSpreadBps).toBeGreaterThan(baseResult.curve[0].creditSpreadBps);
  });

  it('should throw an error for non-positive parameters or invalid LGD', () => {
    expect(() => DuffieSingletonEngine.calculate({ ...baseParams, currentIntensity: 0 })).toThrow(/must be strictly positive/i);
    expect(() => DuffieSingletonEngine.calculate({ ...baseParams, lossGivenDefault: 1.5 })).toThrow(/LGD <= 1.0/i);
    expect(() => DuffieSingletonEngine.calculate({ ...baseParams, maturities: [] })).toThrow(/must not be empty/i);
    expect(() => DuffieSingletonEngine.calculate({ ...baseParams, maturities: [-1.0] })).toThrow(/must be strictly positive/i);
  });

  it('should verify Feller condition evaluation accurately', () => {
    // 2 * kappa * theta = 2 * 0.3 * 0.035 = 0.021. sigma^2 = 0.05^2 = 0.0025. 0.021 >= 0.0025 -> True
    expect(DuffieSingletonMath.isFellerConditionSatisfied(0.3, 0.035, 0.05)).toBe(true);

    // High vol violating Feller: sigma = 0.20 -> sigma^2 = 0.04 > 0.021 -> False
    expect(DuffieSingletonMath.isFellerConditionSatisfied(0.3, 0.035, 0.20)).toBe(false);
  });
});
