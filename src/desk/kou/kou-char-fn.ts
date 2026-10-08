import { KouJumpMoments, KouModelParameters } from './kou-types';

export class KouCharFn {
  public static validateParameters(params: KouModelParameters): void {
    if (params.sigma <= 0) throw new Error('Sigma must be strictly positive');
    if (params.lambda < 0) throw new Error('Lambda intensity must be non-negative');
    if (params.p <= 0 || params.p >= 1) throw new Error('Probability p must be in (0, 1)');
    if (params.eta1 <= 1) throw new Error('eta1 must be strictly greater than 1');
    if (params.eta2 <= 0) throw new Error('eta2 must be strictly positive');
  }

  /**
   * Expected relative jump size: kappa = E[e^Y - 1]
   * = p * eta1 / (eta1 - 1) + q * eta2 / (eta2 + 1) - 1
   */
  public static calculateJumpMoments(params: KouModelParameters): KouJumpMoments {
    this.validateParameters(params);
    const q = 1.0 - params.p;
    const meanY = params.p / params.eta1 - q / params.eta2;
    const varY =
      params.p * (2.0 / (params.eta1 * params.eta1)) +
      q * (2.0 / (params.eta2 * params.eta2)) -
      meanY * meanY;

    const termUp = (params.p * params.eta1) / (params.eta1 - 1.0);
    const termDown = (q * params.eta2) / (params.eta2 + 1.0);
    const kappa = termUp + termDown - 1.0;

    return {
      meanJumpSize: Number(meanY.toFixed(6)),
      varianceJumpSize: Number(varY.toFixed(6)),
      expectedRelativeJump: Number(kappa.toFixed(6)),
    };
  }

  /**
   * Characteristic function of log-asset price under risk-neutral measure:
   * ln(S_T / S_0) = (r - q - 0.5*sigma^2 - lambda*kappa)*T + sigma*W_T + sum_{i=1}^{N_T} Y_i
   * phi(u) = E[exp(i * u * ln(S_T))]
   */
  public static evaluateCharacteristicFunction(
    u: number,
    params: KouModelParameters,
    S0: number,
    T: number,
    r: number,
    q: number
  ): { re: number; im: number } {
    const moments = this.calculateJumpMoments(params);
    const mu = r - q - 0.5 * params.sigma * params.sigma - params.lambda * moments.expectedRelativeJump;

    // Brownian component exponent: i * u * mu * T - 0.5 * u^2 * sigma^2 * T
    const brownianRe = -0.5 * u * u * params.sigma * params.sigma * T;
    const brownianIm = u * mu * T;

    // Jump component: lambda * T * (E[e^{i u Y}] - 1)
    // E[e^{i u Y}] = p * eta1 / (eta1 - i*u) + (1-p) * eta2 / (eta2 + i*u)
    const p = params.p;
    const p1Minus = 1.0 - p;

    // Term 1: p * eta1 / (eta1 - i u) = p * eta1 * (eta1 + i u) / (eta1^2 + u^2)
    const denom1 = params.eta1 * params.eta1 + u * u;
    const term1Re = (p * params.eta1 * params.eta1) / denom1;
    const term1Im = (p * params.eta1 * u) / denom1;

    // Term 2: (1-p) * eta2 / (eta2 + i u) = (1-p) * eta2 * (eta2 - i u) / (eta2^2 + u^2)
    const denom2 = params.eta2 * params.eta2 + u * u;
    const term2Re = (p1Minus * params.eta2 * params.eta2) / denom2;
    const term2Im = (-p1Minus * params.eta2 * u) / denom2;

    const jumpE_Re = term1Re + term2Re;
    const jumpE_Im = term1Im + term2Im;

    const jumpRe = params.lambda * T * (jumpE_Re - 1.0);
    const jumpIm = params.lambda * T * jumpE_Im;

    const totalRe = brownianRe + jumpRe;
    const totalIm = brownianIm + jumpIm + u * Math.log(S0);

    const mag = Math.exp(totalRe);
    return {
      re: mag * Math.cos(totalIm),
      im: mag * Math.sin(totalIm),
    };
  }
}
