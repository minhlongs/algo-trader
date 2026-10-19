import { describe, it, expect } from 'vitest';
import { CreditGradesEngine } from '../../../../src/desk/creditgrades/credit-grades-engine';
import { CreditGradesMath } from '../../../../src/desk/creditgrades/credit-grades-math';
import { CreditGradesParams } from '../../../../src/desk/creditgrades/credit-grades-types';

describe('Desk 121: CreditGrades (2002) Structural Credit Risk Engine', () => {
  const baseParams: CreditGradesParams = {
    equityPrice: 40.0,         // S = $40
    debtPerShare: 20.0,        // D = $20
    equityVolatility: 0.35,    // 35% equity vol
    recoveryRate: 0.50,        // L_bar = 50%
    recoveryVolatility: 0.30,  // lambda = 30%
    riskFreeRate: 0.04,        // 4% risk free rate
    maturities: [1.0, 3.0, 5.0, 10.0],
  };

  it('calculates scaled asset volatility correctly', () => {
    const res = CreditGradesEngine.evaluate(baseParams);
    const expectedSigmaA = (0.35 * 40.0) / (40.0 + 0.5 * 20.0);
    expect(Math.abs(res.assetVolatility - expectedSigmaA)).toBeLessThan(1e-10);
    expect(res.leverageRatio).toBeCloseTo((0.5 * 20.0) / 40.0, 6);
  });

  it('demonstrates positive short-term default probability due to stochastic recovery (Merton puzzle resolution)', () => {
    const res = CreditGradesEngine.evaluate(baseParams);
    const point1Y = res.curve.find((p) => p.maturity === 1.0);
    expect(point1Y).toBeDefined();
    expect(point1Y!.defaultProbability).toBeGreaterThan(0.0);
    expect(point1Y!.survivalProbability).toBeLessThan(1.0);
    expect(point1Y!.parCdsSpreadBps).toBeGreaterThan(0.0);
  });

  it('preserves monotonicity of cumulative default probability with maturity', () => {
    const res = CreditGradesEngine.evaluate(baseParams);
    for (let i = 1; i < res.curve.length; i++) {
      expect(res.curve[i].defaultProbability).toBeGreaterThanOrEqual(
        res.curve[i - 1].defaultProbability - 1e-6
      );
      expect(res.curve[i].survivalProbability).toBeLessThanOrEqual(
        res.curve[i - 1].survivalProbability + 1e-6
      );
    }
  });

  it('computes positive par CDS spreads reflecting risk escalation on increased leverage', () => {
    const lowDebtRes = CreditGradesEngine.evaluate({ ...baseParams, debtPerShare: 10.0 });
    const highDebtRes = CreditGradesEngine.evaluate({ ...baseParams, debtPerShare: 35.0 });

    expect(highDebtRes.fiveYearSpreadBps).toBeGreaterThan(lowDebtRes.fiveYearSpreadBps);
  });

  it('throws on invalid structural credit inputs', () => {
    expect(() =>
      CreditGradesEngine.evaluate({ ...baseParams, recoveryRate: 1.2 })
    ).toThrow(/Recovery rate must be in \(0, 1\)/);
    expect(() =>
      CreditGradesEngine.evaluate({ ...baseParams, equityPrice: -10 })
    ).toThrow(/Equity price must be positive/);
  });
});
