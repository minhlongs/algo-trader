import { describe, expect, it } from 'vitest';
import { LsmcEngine } from '../../../../src/desk/lsmc/lsmc-engine';
import { LsmcParams, OptionType } from '../../../../src/desk/lsmc/lsmc-types';
import { LsmcMath } from '../../../../src/desk/lsmc/lsmc-math';

describe('Longstaff-Schwartz Least Squares Monte Carlo Suite (Desk 101)', () => {
  it('should price American Put strictly higher than European Put due to early exercise premium', () => {
    // 1-year Put slightly ITM initially
    const params: LsmcParams = {
      spotPrice: 36,
      strikePrice: 40,
      riskFreeRate: 0.06,
      dividendYield: 0.0,
      volatility: 0.2,
      timeToMaturity: 1.0,
      optionType: OptionType.PUT,
      numPaths: 10000,
      numSteps: 50,
      basisTerms: 3,
    };

    const result = LsmcEngine.calculate(params);

    expect(result.americanPrice).toBeGreaterThan(0.0);
    expect(result.europeanPrice).toBeGreaterThan(0.0);
    // Early exercise premium must exist for American puts
    expect(result.americanPrice).toBeGreaterThan(result.europeanPrice);
    expect(result.earlyExercisePremium).toBeGreaterThan(0.0);
    expect(result.standardError).toBeGreaterThan(0.0);

    // Check against standard textbook values (for these params, American put ~ 4.47, Euro ~ 3.84)
    expect(result.americanPrice).toBeGreaterThan(4.2);
    expect(result.europeanPrice).toBeGreaterThan(3.5);
  });

  it('should generate zero early exercise premium for American Call on non-dividend paying stock', () => {
    // Merton's theorem: never optimal to exercise American Call early if q = 0
    const params: LsmcParams = {
      spotPrice: 40,
      strikePrice: 40,
      riskFreeRate: 0.06,
      dividendYield: 0.0, // Zero dividend
      volatility: 0.2,
      timeToMaturity: 1.0,
      optionType: OptionType.CALL,
      numPaths: 5000,
      numSteps: 20,
    };

    const result = LsmcEngine.calculate(params);

    // Allowing small Monte Carlo noise variance, American should practically equal European
    expect(Math.abs(result.earlyExercisePremium)).toBeLessThan(result.standardError * 3);
  });

  it('should generate positive early exercise premium for American Call on stock with high dividend', () => {
    // With high dividend, early exercise becomes optimal just before ex-div (continuous proxied here)
    const params: LsmcParams = {
      spotPrice: 40,
      strikePrice: 40,
      riskFreeRate: 0.06,
      dividendYield: 0.1, // 10% dividend makes holding the call painful
      volatility: 0.2,
      timeToMaturity: 1.0,
      optionType: OptionType.CALL,
      numPaths: 5000,
      numSteps: 30,
    };

    const result = LsmcEngine.calculate(params);
    expect(result.earlyExercisePremium).toBeGreaterThan(0.0);
    expect(result.americanPrice).toBeGreaterThan(result.europeanPrice);
  });

  it('should accurately solve linear least squares systems (OLS)', () => {
    // Generate a simple linear problem: Y = 2.0 * X0 + 3.0 * X1
    const X = [
      [1.0, 2.0],
      [2.0, 1.0],
      [3.0, 4.0],
      [4.0, 3.0]
    ];
    const Y = [8.0, 7.0, 18.0, 17.0];

    const beta = LsmcMath.ols(X, Y);

    expect(beta.length).toBe(2);
    expect(beta[0]).toBeCloseTo(2.0, 5);
    expect(beta[1]).toBeCloseTo(3.0, 5);
  });

  it('should generate correct Laguerre polynomials up to degree 3', () => {
    const basis = LsmcMath.laguerrePolynomials(2.0, 4); // x = 2
    expect(basis.length).toBe(4);
    expect(basis[0]).toBe(1.0); // L0 = 1
    expect(basis[1]).toBe(-1.0); // L1 = 1 - 2 = -1
    expect(basis[2]).toBe(-1.0); // L2 = (4 - 8 + 2)/2 = -1
    expect(basis[3]).toBe(-1.0 / 3.0); // L3 = (-8 + 36 - 36 + 6)/6 = -2/6 = -1/3
  });
});