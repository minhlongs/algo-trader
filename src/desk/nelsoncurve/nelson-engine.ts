import {
  NelsonSvenssonParams,
  CurveTenorPoint,
  CreditCurveSpreadPoint,
  NelsonSvenssonResult,
} from './nelson-types.js';
import { NelsonMath } from './nelson-math.js';

export class NelsonEngine {
  public static validateParams(params: NelsonSvenssonParams): void {
    if (params.tau1 <= 0) throw new Error('tau1 scale parameter must be strictly positive');
    if (params.tau2 <= 0) throw new Error('tau2 scale parameter must be strictly positive');
    if (Number.isNaN(params.beta0) || Number.isNaN(params.beta1) || Number.isNaN(params.beta2) || Number.isNaN(params.beta3)) {
      throw new Error('Beta parameters must be valid finite numbers');
    }
  }

  public static buildYieldCurve(
    params: NelsonSvenssonParams,
    tenors: number[] = [0.25, 0.5, 1, 2, 3, 5, 7, 10, 20, 30]
  ): NelsonSvenssonResult {
    this.validateParams(params);

    const spotPoints: CurveTenorPoint[] = tenors
      .filter(t => t > 0)
      .sort((a, b) => a - b)
      .map(t => NelsonMath.evaluatePoint(params, t));

    return {
      params,
      spotPoints,
      asymptoticRate: params.beta0,
      shortRate: params.beta0 + params.beta1,
    };
  }

  public static buildCreditSpreadCurve(
    benchmarkParams: NelsonSvenssonParams,
    creditParams: NelsonSvenssonParams,
    recoveryRate: number = 0.40,
    tenors: number[] = [1, 2, 3, 5, 7, 10]
  ): CreditCurveSpreadPoint[] {
    this.validateParams(benchmarkParams);
    this.validateParams(creditParams);

    if (recoveryRate < 0 || recoveryRate >= 1.0) {
      throw new Error('Recovery rate must be in [0, 1)');
    }

    const lgd = 1.0 - recoveryRate;

    return tenors
      .filter(t => t > 0)
      .sort((a, b) => a - b)
      .map(t => {
        const benchZero = NelsonMath.calculateZeroRate(benchmarkParams, t);
        const credZero = NelsonMath.calculateZeroRate(creditParams, t);
        const spread = credZero - benchZero;
        const spreadBps = spread * 10000;

        // Constant intensity approximation over [0, t]: hazard = spread / (1 - R)
        const hazardRate = Math.max(0, spread / lgd);
        const survivalProbability = Math.exp(-hazardRate * t);

        return {
          maturity: t,
          benchmarkZeroRate: benchZero,
          creditZeroRate: credZero,
          creditSpreadBps: spreadBps,
          hazardRate,
          survivalProbability,
        };
      });
  }
}
