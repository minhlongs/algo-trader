import { G2ppBondPricingResult, G2ppParameters, G2ppState } from './g2pp-types';
import { G2ppVariance } from './g2pp-variance';

export class G2ppEngine {
  public priceZeroCouponBond(
    params: G2ppParameters,
    state: G2ppState,
    maturityT: number,
    baseForwardRate = 0.03
  ): G2ppBondPricingResult {
    const { a, b, sigma, eta, rho } = params;
    const { x, y, t } = state;

    if (maturityT <= t) throw new Error('Maturity T must be strictly greater than current time t');
    if (sigma <= 0 || eta <= 0) throw new Error('Volatilities sigma and eta must be strictly positive');
    if (a <= 0 || b <= 0) throw new Error('Mean reversion parameters a and b must be positive');
    if (rho < -1.0 || rho > 1.0) throw new Error('Correlation rho must be between -1.0 and 1.0');

    const tau = maturityT - t;
    const vTau = G2ppVariance.calculate(params, tau);
    const vT = G2ppVariance.calculate(params, maturityT);
    const vt = G2ppVariance.calculate(params, t);

    const bA = (1.0 - Math.exp(-a * tau)) / a;
    const bB = (1.0 - Math.exp(-b * tau)) / b;

    // Shift term integrating deterministic forward curve
    const deterministicDiscount = Math.exp(-baseForwardRate * tau);
    const stochasticExponent = -bA * x - bB * y - 0.5 * (vT - vt) + 0.5 * vTau;

    const bondPrice = deterministicDiscount * Math.exp(stochasticExponent);
    const ytm = (-Math.log(bondPrice) / tau) * 100.0;

    // Instantaneous forward rate
    const dVTau = G2ppVariance.calculateDerivative(params, tau);
    const instForward = (baseForwardRate + Math.exp(-a * tau) * x + Math.exp(-b * tau) * y - 0.5 * dVTau) * 100.0;

    return {
      price: Number(bondPrice.toFixed(6)),
      yieldToMaturityPct: Number(ytm.toFixed(4)),
      varianceIntegral: Number(vTau.toFixed(6)),
      instantaneousForwardRatePct: Number(instForward.toFixed(4)),
      maturityTau: Number(tau.toFixed(4)),
    };
  }
}
