import { describe, it, expect } from 'vitest';
import { KeyRateDurationEngine } from '../../../../src/desk/keyrate/keyrate-duration-engine';
import { CurveImmunizationEngine } from '../../../../src/desk/keyrate/curve-immunization-engine';
import { BondCashFlow } from '../../../../src/desk/keyrate/keyrate-types';

describe('Key Rate Duration & Curve Immunization Desk Suite', () => {
  // 10-year annual bond with 5% coupon paying $50/yr and $1000 par at year 10
  const bondCashFlows: BondCashFlow[] = [
    { timeYears: 1, cashFlowUsd: 50 },
    { timeYears: 2, cashFlowUsd: 50 },
    { timeYears: 3, cashFlowUsd: 50 },
    { timeYears: 4, cashFlowUsd: 50 },
    { timeYears: 5, cashFlowUsd: 50 },
    { timeYears: 6, cashFlowUsd: 50 },
    { timeYears: 7, cashFlowUsd: 50 },
    { timeYears: 8, cashFlowUsd: 50 },
    { timeYears: 9, cashFlowUsd: 50 },
    { timeYears: 10, cashFlowUsd: 1050 },
  ];

  it('computes Key Rate Durations with highest sensitivity near the terminal maturity', () => {
    const engine = new KeyRateDurationEngine();
    const krd = engine.computeKrd(bondCashFlows, 5.0);

    expect(krd.length).toBe(4); // 2Y, 5Y, 10Y, 30Y
    const krd10 = krd.find(k => k.tenorYears === 10)!;
    const krd30 = krd.find(k => k.tenorYears === 30)!;

    expect(krd10.keyRateDurationYears).toBeGreaterThan(4.0);
    // 30Y key rate should have 0 duration because no cash flows occur beyond 10Y
    expect(krd30.keyRateDurationYears).toBeCloseTo(0.0, 1);
  });

  it('calculates immunization hedges that neutralize key rate DV01s', () => {
    const immunizer = new CurveImmunizationEngine();
    const hedge = immunizer.calculateImmunizationHedge(bondCashFlows, 5.0);

    expect(hedge.hedgeWeights.length).toBe(4);
    // Net DV01 residual should be effectively 0
    expect(Math.abs(hedge.netDv01ResidualUsd)).toBeLessThan(1e-2);
  });
});
