import { VgModelParameters, VgMomentsResult } from './variance-gamma-types';

export interface ComplexNumber {
  readonly re: number;
  readonly im: number;
}

export class VarianceGammaCharFn {
  public static calculateDriftCorrector(params: VgModelParameters): number {
    const { sigma, nu, theta } = params;
    const arg = 1.0 - theta * nu - 0.5 * sigma * sigma * nu;
    if (arg <= 0) {
      throw new Error('Martingale condition violated: 1 - theta*nu - 0.5*sigma^2*nu must be strictly positive');
    }
    return (1.0 / nu) * Math.log(arg);
  }

  public static calculateMoments(params: VgModelParameters, t: number): VgMomentsResult {
    const { sigma, nu, theta } = params;
    const variance = (sigma * sigma + nu * theta * theta) * t;
    const stdDev = Math.sqrt(Math.max(1e-12, variance));

    const numSkew = (2.0 * Math.pow(theta, 3) * Math.pow(nu, 2) + 3.0 * sigma * sigma * theta * nu) * t;
    const skewness = numSkew / (Math.pow(variance, 1.5) || 1.0);

    const excessKurtosis = (3.0 * nu * Math.pow(sigma * sigma + nu * theta * theta, 2) * t) / (variance * variance);

    return {
      mean: theta * t,
      variance,
      skewness: Number(skewness.toFixed(4)),
      excessKurtosis: Number(excessKurtosis.toFixed(4)),
    };
  }

  public static evaluateCharFn(
    u: number,
    params: VgModelParameters,
    t: number
  ): ComplexNumber {
    const { sigma, nu, theta } = params;

    // Term: 1 - i * u * theta * nu + 0.5 * sigma^2 * nu * u^2
    const realPart = 1.0 + 0.5 * sigma * sigma * nu * u * u;
    const imagPart = -u * theta * nu;

    const r = Math.sqrt(realPart * realPart + imagPart * imagPart);
    const phiAngle = Math.atan2(imagPart, realPart);

    // Raised to power -t / nu
    const power = -t / nu;
    const magnitude = Math.pow(r, power);
    const finalAngle = power * phiAngle;

    return {
      re: magnitude * Math.cos(finalAngle),
      im: magnitude * Math.sin(finalAngle),
    };
  }
}
