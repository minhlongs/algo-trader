import { NssParameters } from './fixedincome-types';

export class NelsonSiegelSvenssonCurve {
  /**
   * Evaluates zero-coupon spot rate y(t) in percentage points via NSS 6-parameter model:
   * y(t) = beta0 + beta1 * (1 - exp(-t/tau1))/(t/tau1)
   *              + beta2 * [ (1 - exp(-t/tau1))/(t/tau1) - exp(-t/tau1) ]
   *              + beta3 * [ (1 - exp(-t/tau2))/(t/tau2) - exp(-t/tau2) ]
   */
  public evaluateZeroRate(maturityYears: number, params: NssParameters): number {
    if (maturityYears <= 0) return params.beta0 + params.beta1;

    const t = maturityYears;
    const t_tau1 = t / Math.max(1e-4, params.tau1);
    const t_tau2 = t / Math.max(1e-4, params.tau2);

    const exp1 = Math.exp(-t_tau1);
    const exp2 = Math.exp(-t_tau2);

    const g1 = (1.0 - exp1) / t_tau1;
    const g2 = g1 - exp1;
    const g3 = (1.0 - exp2) / t_tau2 - exp2;

    const rate = params.beta0 + params.beta1 * g1 + params.beta2 * g2 + params.beta3 * g3;
    return Number(rate.toFixed(6));
  }

  /**
   * Discount factor P(0, t) = exp(-y(t) * t / 100)
   */
  public getDiscountFactor(maturityYears: number, params: NssParameters): number {
    const ratePct = this.evaluateZeroRate(maturityYears, params);
    const rateDecimal = ratePct / 100.0;
    return Number(Math.exp(-rateDecimal * maturityYears).toFixed(6));
  }

  /**
   * Instantaneous forward rate f(t) = -d ln(P(0, t)) / dt
   */
  public evaluateInstantaneousForwardRate(maturityYears: number, params: NssParameters): number {
    if (maturityYears <= 0) return params.beta0 + params.beta1;

    const t = maturityYears;
    const t_tau1 = t / Math.max(1e-4, params.tau1);
    const t_tau2 = t / Math.max(1e-4, params.tau2);

    const exp1 = Math.exp(-t_tau1);
    const exp2 = Math.exp(-t_tau2);

    const fwd =
      params.beta0 +
      params.beta1 * exp1 +
      params.beta2 * (t_tau1 * exp1) +
      params.beta3 * (t_tau2 * exp2);

    return Number(fwd.toFixed(6));
  }
}
