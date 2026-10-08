import { SviParameters } from './volsurface-types';
import { SviCalibrator } from './svi-calibrator';

export interface DupireInputSlice {
  expiryYears: number;
  sviParams: SviParameters;
  forward: number;
}

export class DupireLocalVolPricer {
  private calibrator = new SviCalibrator();

  /**
   * Continuous local variance calculation from total variance w(k, T) formulation:
   * sigma_local^2(k, T) = (dw/dT) / ( (1 - k*w'/(2w))^2 - (w'^2/4)*(1/w + 1/4) + w''/2 )
   */
  public computeLocalVolatility(
    strike: number,
    nearSlice: DupireInputSlice,
    farSlice: DupireInputSlice
  ): number {
    if (farSlice.expiryYears <= nearSlice.expiryYears) {
      throw new Error('Far slice expiry must be strictly greater than near slice expiry');
    }

    const midExpiry = 0.5 * (nearSlice.expiryYears + farSlice.expiryYears);
    const midFwd = 0.5 * (nearSlice.forward + farSlice.forward);
    const k = Math.log(strike / midFwd);

    const dT = farSlice.expiryYears - nearSlice.expiryYears;
    const wNear = this.calibrator.evaluateTotalVariance(k, nearSlice.sviParams);
    const wFar = this.calibrator.evaluateTotalVariance(k, farSlice.sviParams);

    const dw_dT = Math.max(1e-6, (wFar - wNear) / dT);

    // Interpolate SVI params for spatial derivatives at midExpiry
    const midParams: SviParameters = {
      a: 0.5 * (nearSlice.sviParams.a + farSlice.sviParams.a),
      b: 0.5 * (nearSlice.sviParams.b + farSlice.sviParams.b),
      rho: 0.5 * (nearSlice.sviParams.rho + farSlice.sviParams.rho),
      m: 0.5 * (nearSlice.sviParams.m + farSlice.sviParams.m),
      sigma: 0.5 * (nearSlice.sviParams.sigma + farSlice.sviParams.sigma),
    };

    const g = this.calibrator.evaluateDurrlemanCondition(k, midParams);

    // Denominator must be strictly positive (absence of butterfly arbitrage)
    const safeDenom = Math.max(1e-4, g);
    const localVariance = dw_dT / safeDenom;

    return Number(Math.sqrt(Math.max(1e-4, localVariance)).toFixed(6));
  }
}
