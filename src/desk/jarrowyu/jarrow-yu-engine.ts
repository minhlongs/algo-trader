import { JarrowYuParams, JarrowYuResult } from './jarrow-yu-types';
import { JarrowYuMath } from './jarrow-yu-math';

export class JarrowYuEngine {
  public static validate(params: JarrowYuParams): void {
    if (params.autonomousHazardA <= 0 || !Number.isFinite(params.autonomousHazardA)) {
      throw new Error(`Invalid autonomousHazardA: ${params.autonomousHazardA}. Must be > 0.`);
    }
    if (params.baselineHazardB <= 0 || !Number.isFinite(params.baselineHazardB)) {
      throw new Error(`Invalid baselineHazardB: ${params.baselineHazardB}. Must be > 0.`);
    }
    if (params.contagionJumpA1 < 0 || !Number.isFinite(params.contagionJumpA1)) {
      throw new Error(`Invalid contagionJumpA1: ${params.contagionJumpA1}. Must be >= 0.`);
    }
    if (params.maturity <= 0 || !Number.isFinite(params.maturity)) {
      throw new Error(`Invalid maturity: ${params.maturity}. Must be > 0.`);
    }
    if (params.recoveryRateB !== undefined) {
      if (params.recoveryRateB < 0 || params.recoveryRateB >= 1.0 || !Number.isFinite(params.recoveryRateB)) {
        throw new Error(`Invalid recoveryRateB: ${params.recoveryRateB}. Must be in [0, 1).`);
      }
    }
    if (params.riskFreeRate !== undefined && !Number.isFinite(params.riskFreeRate)) {
      throw new Error(`Invalid riskFreeRate: ${params.riskFreeRate}.`);
    }
  }

  public static evaluate(params: JarrowYuParams): JarrowYuResult {
    this.validate(params);

    const recoveryB = params.recoveryRateB ?? 0.40;
    const r = params.riskFreeRate ?? 0.03;

    const survival = JarrowYuMath.computeProbabilities(
      params.autonomousHazardA,
      params.baselineHazardB,
      params.contagionJumpA1,
      params.maturity
    );

    const baselineLegs = JarrowYuMath.computeCdsLegs(
      params.autonomousHazardA,
      params.baselineHazardB,
      0.0,
      params.maturity,
      r,
      recoveryB
    );

    const vulnerableLegs = JarrowYuMath.computeCdsLegs(
      params.autonomousHazardA,
      params.baselineHazardB,
      params.contagionJumpA1,
      params.maturity,
      r,
      recoveryB
    );

    return {
      params,
      survival,
      baselineCdsSpreadB: baselineLegs.spread,
      vulnerableCdsSpreadB: vulnerableLegs.spread,
      contagionRiskPremiumB: vulnerableLegs.spread - baselineLegs.spread,
      protectionLegPv: vulnerableLegs.protectionLegPv,
      annuityLegPv: vulnerableLegs.annuityLegPv,
    };
  }
}
