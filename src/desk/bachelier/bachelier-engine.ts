import { NormalDistribution } from '../holee/normal-distribution';
import { BachelierModelParameters, BachelierOptionResult } from './bachelier-types';

export class BachelierEngine {
  public priceOption(params: BachelierModelParameters): BachelierOptionResult {
    const { forwardPrice: F, strikePrice: K, timeToExpiryYears: tau, normalVolatility: sigmaN } = params;
    const r = params.riskFreeRatePct / 100.0;

    if (tau <= 0) throw new Error('Time to expiry must be positive');
    if (sigmaN <= 0) throw new Error('Normal volatility must be strictly positive');

    const discount = Math.exp(-r * tau);
    const sqrtTau = Math.sqrt(tau);
    const stdDev = sigmaN * sqrtTau;
    const d = (F - K) / stdDev;

    const nD = NormalDistribution.cdf(d);
    const npD = NormalDistribution.pdf(d);

    const callPrice = discount * ((F - K) * nD + stdDev * npD);
    const putPrice = discount * ((K - F) * (1.0 - nD) + stdDev * npD);

    const callDelta = discount * nD;
    const putDelta = discount * (nD - 1.0);
    const gamma = discount * (npD / stdDev);
    const vega = discount * sqrtTau * npD;
    const intrinsicValue = discount * Math.max(0.0, F - K);

    return {
      callPrice: Number(callPrice.toFixed(4)),
      putPrice: Number(putPrice.toFixed(4)),
      dScore: Number(d.toFixed(4)),
      callDelta: Number(callDelta.toFixed(6)),
      putDelta: Number(putDelta.toFixed(6)),
      gamma: Number(gamma.toFixed(6)),
      vega: Number(vega.toFixed(6)),
      intrinsicValueCall: Number(intrinsicValue.toFixed(4)),
    };
  }

  public impliedNormalVolatility(
    targetCallPrice: number,
    F: number,
    K: number,
    tau: number,
    riskFreeRatePct: number,
    maxIterations = 20,
    tolerance = 1e-7
  ): number {
    if (tau <= 0) throw new Error('Time to expiry must be positive');
    const r = riskFreeRatePct / 100.0;
    const discount = Math.exp(-r * tau);
    const intrinsic = discount * Math.max(0.0, F - K);

    if (targetCallPrice <= intrinsic) {
      throw new Error('Call price is below or equal to discounted intrinsic value');
    }

    const sqrtTau = Math.sqrt(tau);
    // Initial guess using ATM normal approximation
    const invSqrt2Pi = Math.sqrt(2.0 * Math.PI);
    let sigma = Math.max(1e-4, ((targetCallPrice / discount) * invSqrt2Pi) / sqrtTau);

    for (let iter = 0; iter < maxIterations; iter++) {
      const res = this.priceOption({
        forwardPrice: F,
        strikePrice: K,
        timeToExpiryYears: tau,
        normalVolatility: sigma,
        riskFreeRatePct,
      });

      const diff = res.callPrice - targetCallPrice;
      if (Math.abs(diff) < tolerance) {
        return Number(sigma.toFixed(4));
      }

      const vega = Math.max(1e-12, res.vega);
      const step = diff / vega;
      sigma = Math.max(1e-6, sigma - step);
    }

    return Number(sigma.toFixed(4));
  }
}
