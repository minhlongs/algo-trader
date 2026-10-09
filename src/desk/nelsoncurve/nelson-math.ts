import { NelsonSvenssonParams, CurveTenorPoint } from './nelson-types.js';

export class NelsonMath {
  /**
   * Evaluates the continuous zero spot rate at maturity t under Nelson-Siegel-Svensson
   * y(t) = beta0 + beta1 * ((1 - exp(-t/tau1)) / (t/tau1))
   *        + beta2 * (((1 - exp(-t/tau1)) / (t/tau1)) - exp(-t/tau1))
   *        + beta3 * (((1 - exp(-t/tau2)) / (t/tau2)) - exp(-t/tau2))
   */
  public static calculateZeroRate(params: NelsonSvenssonParams, t: number): number {
    if (t <= 1e-8) {
      return params.beta0 + params.beta1;
    }

    const m1 = t / params.tau1;
    const exp1 = Math.exp(-m1);
    const factor1 = (1.0 - exp1) / m1;
    const factor2 = factor1 - exp1;

    const m2 = t / params.tau2;
    const exp2 = Math.exp(-m2);
    const factor3 = (1.0 - exp2) / m2;
    const factor4 = factor3 - exp2;

    return params.beta0 + params.beta1 * factor1 + params.beta2 * factor2 + params.beta3 * factor4;
  }

  /**
   * Evaluates the instantaneous forward rate f(t) under NSS
   * f(t) = beta0 + beta1 * exp(-t/tau1) + beta2 * (t/tau1) * exp(-t/tau1) + beta3 * (t/tau2) * exp(-t/tau2)
   */
  public static calculateInstantaneousForward(params: NelsonSvenssonParams, t: number): number {
    if (t <= 1e-8) {
      return params.beta0 + params.beta1;
    }

    const m1 = t / params.tau1;
    const exp1 = Math.exp(-m1);

    const m2 = t / params.tau2;
    const exp2 = Math.exp(-m2);

    return params.beta0 + params.beta1 * exp1 + params.beta2 * m1 * exp1 + params.beta3 * m2 * exp2;
  }

  /**
   * Builds single tenor point with zero rate, discount factor, and forward rate
   */
  public static evaluatePoint(params: NelsonSvenssonParams, maturity: number): CurveTenorPoint {
    const zeroRate = this.calculateZeroRate(params, maturity);
    const discountFactor = Math.exp(-zeroRate * maturity);
    const instantaneousForward = this.calculateInstantaneousForward(params, maturity);

    return {
      maturity,
      zeroRate,
      discountFactor,
      instantaneousForward,
    };
  }
}
