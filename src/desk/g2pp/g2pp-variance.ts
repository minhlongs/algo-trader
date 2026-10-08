import { G2ppParameters } from './g2pp-types';

export class G2ppVariance {
  public static calculate(params: G2ppParameters, tau: number): number {
    const { a, b, sigma, eta, rho } = params;

    if (tau <= 0) return 0.0;
    if (Math.abs(a - b) < 1e-6) {
      throw new Error('G2++ parameters a and b must be distinct to prevent singularity');
    }

    const termX =
      (sigma * sigma) /
      (a * a) *
      (tau + (2.0 / a) * Math.exp(-a * tau) - (1.0 / (2.0 * a)) * Math.exp(-2.0 * a * tau) - 1.5 / a);

    const termY =
      (eta * eta) /
      (b * b) *
      (tau + (2.0 / b) * Math.exp(-b * tau) - (1.0 / (2.0 * b)) * Math.exp(-2.0 * b * tau) - 1.5 / b);

    const termCross =
      2.0 *
      rho *
      ((sigma * eta) / (a * b)) *
      (tau +
        (Math.exp(-a * tau) - 1.0) / a +
        (Math.exp(-b * tau) - 1.0) / b -
        (Math.exp(-(a + b) * tau) - 1.0) / (a + b));

    return Math.max(0.0, termX + termY + termCross);
  }

  public static calculateDerivative(params: G2ppParameters, tau: number): number {
    const { a, b, sigma, eta, rho } = params;

    if (tau <= 0) return 0.0;

    const dTermX =
      (sigma * sigma) /
      (a * a) *
      (1.0 - 2.0 * Math.exp(-a * tau) + Math.exp(-2.0 * a * tau));

    const dTermY =
      (eta * eta) /
      (b * b) *
      (1.0 - 2.0 * Math.exp(-b * tau) + Math.exp(-2.0 * b * tau));

    const dTermCross =
      2.0 *
      rho *
      ((sigma * eta) / (a * b)) *
      (1.0 - Math.exp(-a * tau) - Math.exp(-b * tau) + Math.exp(-(a + b) * tau));

    return dTermX + dTermY + dTermCross;
  }
}
