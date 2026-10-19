import { describe, it, expect } from 'vitest';
import { JarrowYuEngine } from '../../../../src/desk/jarrowyu/jarrow-yu-engine';
import { JarrowYuParams } from '../../../../src/desk/jarrowyu/jarrow-yu-types';

describe('Desk 133: Jarrow-Yu (2001) Counterparty Risk & Asymmetric Contagion Engine', () => {
  const baseParams: JarrowYuParams = {
    autonomousHazardA: 0.03, // 300 bps
    baselineHazardB: 0.02,   // 200 bps
    contagionJumpA1: 0.05,   // 500 bps jump upon A default
    recoveryRateB: 0.40,
    riskFreeRate: 0.03,
    maturity: 5.0,           // 5-year CDS
  };

  it('evaluates asymmetric default contagion with positive contagion risk premium', () => {
    const res = JarrowYuEngine.evaluate(baseParams);

    // Contagion elevates CDS spread
    expect(res.vulnerableCdsSpreadB).toBeGreaterThan(res.baselineCdsSpreadB);
    expect(res.contagionRiskPremiumB).toBeGreaterThan(0.0);
    // Unconditional survival is lower than no-contagion survival
    const noContagionSurvB = Math.exp(-baseParams.baselineHazardB * baseParams.maturity);
    expect(res.survival.survivalB).toBeLessThan(noContagionSurvB);
    // Conditional survival given A defaults is strictly lower than joint or marginal
    expect(res.survival.conditionalSurvivalB).toBeLessThan(res.survival.survivalB);
  });

  it('matches baseline CDS spread when contagion jump is zero', () => {
    const res = JarrowYuEngine.evaluate({ ...baseParams, contagionJumpA1: 0.0 });

    expect(res.contagionRiskPremiumB).toBeCloseTo(0.0, 6);
    expect(res.vulnerableCdsSpreadB).toBeCloseTo(res.baselineCdsSpreadB, 6);
    expect(res.survival.survivalB).toBeCloseTo(Math.exp(-0.02 * 5.0), 6);
  });

  it('handles singularity smoothly when a0 equals a1', () => {
    const res = JarrowYuEngine.evaluate({
      ...baseParams,
      autonomousHazardA: 0.04,
      contagionJumpA1: 0.04,
    });

    expect(Number.isFinite(res.survival.survivalB)).toBe(true);
    expect(Number.isFinite(res.vulnerableCdsSpreadB)).toBe(true);
    expect(res.survival.survivalB).toBeGreaterThan(0.0);
    expect(res.survival.survivalB).toBeLessThan(1.0);
  });

  it('demonstrates monotonicity with respect to contagion jump size', () => {
    const lowJump = JarrowYuEngine.evaluate({ ...baseParams, contagionJumpA1: 0.02 });
    const highJump = JarrowYuEngine.evaluate({ ...baseParams, contagionJumpA1: 0.08 });

    expect(highJump.vulnerableCdsSpreadB).toBeGreaterThan(lowJump.vulnerableCdsSpreadB);
    expect(highJump.contagionRiskPremiumB).toBeGreaterThan(lowJump.contagionRiskPremiumB);
    expect(highJump.survival.survivalB).toBeLessThan(lowJump.survival.survivalB);
  });

  it('validates invalid inputs and throws helpful error messages', () => {
    expect(() => JarrowYuEngine.evaluate({ ...baseParams, autonomousHazardA: -0.01 })).toThrow(/Invalid autonomousHazardA/);
    expect(() => JarrowYuEngine.evaluate({ ...baseParams, baselineHazardB: 0 })).toThrow(/Invalid baselineHazardB/);
    expect(() => JarrowYuEngine.evaluate({ ...baseParams, contagionJumpA1: -0.05 })).toThrow(/Invalid contagionJumpA1/);
    expect(() => JarrowYuEngine.evaluate({ ...baseParams, maturity: 0 })).toThrow(/Invalid maturity/);
    expect(() => JarrowYuEngine.evaluate({ ...baseParams, recoveryRateB: 1.2 })).toThrow(/Invalid recoveryRateB/);
  });
});
