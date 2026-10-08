import { HjmVolatilityFactor } from './hjm-types';

export class HjmVolatilityFactorFactory {
  /**
   * Constant volatility factor: sigma(t, T) = sigma0
   * Integral_t^T sigma(t, u) du = sigma0 * (T - t)
   * Drift: alpha(t, T) = sigma0^2 * (T - t)
   */
  public static createConstantFactor(
    factorName: string,
    sigma0: number
  ): HjmVolatilityFactor {
    if (sigma0 <= 0) {
      throw new Error('Volatility sigma0 must be strictly positive');
    }

    return {
      factorName,
      evaluate: (t: number, T: number): number => {
        return T >= t ? sigma0 : 0.0;
      },
      integrateDriftComponent: (t: number, T: number): number => {
        if (T <= t) return 0.0;
        const tau = T - t;
        return sigma0 * sigma0 * tau;
      },
    };
  }

  /**
   * Exponential decay factor (Vasicek / Cheyette-like):
   * sigma(t, T) = sigma0 * exp(-kappa * (T - t))
   * Integral_t^T sigma(t, u) du = (sigma0 / kappa) * (1 - exp(-kappa * (T - t)))
   * Drift: alpha(t, T) = (sigma0^2 / kappa) * exp(-kappa * (T - t)) * (1 - exp(-kappa * (T - t)))
   */
  public static createExponentialDecayFactor(
    factorName: string,
    sigma0: number,
    kappa: number
  ): HjmVolatilityFactor {
    if (sigma0 <= 0 || kappa <= 0) {
      throw new Error('sigma0 and kappa must be strictly positive');
    }

    return {
      factorName,
      evaluate: (t: number, T: number): number => {
        if (T < t) return 0.0;
        return sigma0 * Math.exp(-kappa * (T - t));
      },
      integrateDriftComponent: (t: number, T: number): number => {
        if (T <= t) return 0.0;
        const tau = T - t;
        const expDecay = Math.exp(-kappa * tau);
        const integral = (sigma0 / kappa) * (1.0 - expDecay);
        const sig = sigma0 * expDecay;
        return sig * integral;
      },
    };
  }
}
