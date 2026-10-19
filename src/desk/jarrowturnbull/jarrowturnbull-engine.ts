/**
 * Jarrow-Turnbull (1995) Credit Risk & Risky Debt Valuation Engine
 */

import {
  JarrowTurnbullConfig,
  JarrowTurnbullEstimates,
} from './jarrowturnbull-types.js';
import { JarrowTurnbullMath } from './jarrowturnbull-math.js';

export class JarrowTurnbullEngine {
  public static validateConfig(config: JarrowTurnbullConfig): void {
    if (!config) {
      throw new Error('JarrowTurnbull config must be provided');
    }
    if (config.riskFreeRate < -0.1 || config.riskFreeRate > 1.0) {
      throw new Error(`Invalid risk-free rate: ${config.riskFreeRate}`);
    }
    if (config.hazardRate < 0) {
      throw new Error(`Hazard rate cannot be negative: ${config.hazardRate}`);
    }
    if (config.recoveryRate < 0 || config.recoveryRate > 1.0) {
      throw new Error(`Recovery rate must be in [0, 1]: ${config.recoveryRate}`);
    }
  }

  public static estimate(
    maturity: number,
    config: JarrowTurnbullConfig,
    frequency: number = 4
  ): JarrowTurnbullEstimates {
    this.validateConfig(config);

    if (maturity <= 0) {
      throw new Error(`Maturity must be positive: ${maturity}`);
    }

    const { riskFreeRate: r, hazardRate: lambda, recoveryRate: delta } = config;

    const riskFreeDiscount = JarrowTurnbullMath.computeRiskFreeDiscount(r, maturity);
    const defaultProbability = JarrowTurnbullMath.computeDefaultProbability(lambda, maturity);
    const survivalProbability = JarrowTurnbullMath.computeSurvivalProbability(lambda, maturity);
    const riskyBondPrice = JarrowTurnbullMath.computeRiskyZeroCouponPrice(r, lambda, delta, maturity, 100);
    const spread = JarrowTurnbullMath.computeCreditSpread(lambda, delta, maturity);
    const parCdsSpread = JarrowTurnbullMath.computeParCdsSpread(r, lambda, delta, maturity, frequency);

    return {
      riskFreeDiscount: Number(riskFreeDiscount.toFixed(6)),
      defaultProbability: Number(defaultProbability.toFixed(6)),
      survivalProbability: Number(survivalProbability.toFixed(6)),
      riskyBondPrice: Number(riskyBondPrice.toFixed(4)),
      creditSpreadBps: Number((spread * 10000).toFixed(2)),
      parCdsSpreadBps: Number((parCdsSpread * 10000).toFixed(2)),
      maturity,
    };
  }
}
