import { describe, it, expect } from 'vitest';
import { LelandToftEngine } from '../../../../src/desk/lelandtoft/leland-toft-engine';

describe('LelandToftEngine — Optimal Capital Structure Credit Suite', () => {
  const baseParams = {
    assetValue: 100.0,
    coupon: 6.0,
    principal: 100.0,
    riskFreeRate: 0.05,
    payoutRate: 0.02,
    assetVolatility: 0.2,
    taxRate: 0.25,
    bankruptcyCostRate: 0.3,
  };

  it('calculates consistent firm, debt, and equity valuations with endogenous default threshold', () => {
    const res = LelandToftEngine.calculate(baseParams);

    expect(res.firmValue).toBeGreaterThan(0.0);
    expect(res.debtValue).toBeGreaterThan(0.0);
    expect(res.equityValue).toBeGreaterThan(0.0);
    expect(res.firmValue).toBeCloseTo(res.debtValue + res.equityValue, 4);
    expect(res.endogenousDefaultBoundary).toBeLessThan(baseParams.assetValue);
    expect(res.creditSpreadBps).toBeGreaterThan(0.0);
  });

  it('demonstrates smooth pasting behavior: equity value approaches zero as assets reach default boundary', () => {
    const resBase = LelandToftEngine.calculate(baseParams);
    const boundary = resBase.endogenousDefaultBoundary;

    const resNearDefault = LelandToftEngine.calculate({
      ...baseParams,
      assetValue: boundary * 1.001,
    });

    expect(resNearDefault.equityValue).toBeLessThan(resBase.equityValue * 0.01);
    expect(resNearDefault.defaultDiscountFactor).toBeCloseTo(1.0, 1);
  });

  it('reflects positive value of interest tax deduction with higher tax rates', () => {
    const resLowTax = LelandToftEngine.calculate({ ...baseParams, taxRate: 0.1 });
    const resHighTax = LelandToftEngine.calculate({ ...baseParams, taxRate: 0.35 });

    expect(resHighTax.taxShieldValue).toBeGreaterThan(resLowTax.taxShieldValue);
    expect(resHighTax.firmValue).toBeGreaterThan(resLowTax.firmValue);
  });

  it('amplifies credit spreads as bankruptcy friction increases', () => {
    const resLowLoss = LelandToftEngine.calculate({ ...baseParams, bankruptcyCostRate: 0.1 });
    const resHighLoss = LelandToftEngine.calculate({ ...baseParams, bankruptcyCostRate: 0.5 });

    expect(resHighLoss.creditSpreadBps).toBeGreaterThan(resLowLoss.creditSpreadBps);
    expect(resHighLoss.debtValue).toBeLessThan(resLowLoss.debtValue);
  });

  it('throws descriptive error on invalid inputs', () => {
    expect(() =>
      LelandToftEngine.calculate({
        ...baseParams,
        assetValue: 0,
      })
    ).toThrow('assetValue must be > 0');

    expect(() =>
      LelandToftEngine.calculate({
        ...baseParams,
        taxRate: 1.0,
      })
    ).toThrow('taxRate must be in [0, 1)');

    expect(() =>
      LelandToftEngine.calculate({
        ...baseParams,
        bankruptcyCostRate: -0.1,
      })
    ).toThrow('bankruptcyCostRate must be in [0, 1)');
  });
});
