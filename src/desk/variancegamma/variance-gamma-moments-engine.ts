import {
  VarianceGammaMomentsParams,
  VarianceGammaMomentsOptionResult,
  Complex,
} from './variance-gamma-moments-types';
import { VarianceGammaMomentsMath as VMM } from './variance-gamma-moments-math';

export class VarianceGammaMomentsEngine {
  public static calculate(params: VarianceGammaMomentsParams): VarianceGammaMomentsOptionResult {
    const {
      spotPrice: S0,
      strikePrice: K,
      timeToMaturity: T,
      riskFreeRate: r,
      dividendYield: q,
      sigma,
      nu,
      theta,
      isCall = true,
    } = params;

    if (S0 <= 0 || K <= 0 || T <= 0 || sigma <= 0 || nu <= 0) {
      throw new Error('Prices, maturity, volatility sigma, and nu must be strictly positive');
    }

    const omega = VMM.calculateOmega(sigma, nu, theta);
    const moments = VMM.calculateAnalyticalMoments(sigma, nu, theta, T);

    const forwardLog = Math.log(S0) + (r - q + omega) * T;
    const lnK = Math.log(K);

    // Integrand 1: Re[ exp(-i*u*lnK) * phi(u - i) / (i * u * S0 * exp((r-q)*T)) ]
    const f1 = (u: number): number => {
      const z: Complex = { re: u, im: -1.0 };
      const cf1 = VMM.characteristicFunction(z, forwardLog, T, sigma, nu, theta);
      const expTerm: Complex = { re: Math.cos(-u * lnK), im: Math.sin(-u * lnK) };
      const num = VMM.mul(expTerm, cf1);
      const denom: Complex = { re: 0.0, im: u * S0 * Math.exp((r - q) * T) };
      return VMM.div(num, denom).re;
    };

    // Integrand 2: Re[ exp(-i*u*lnK) * phi(u) / (i * u) ]
    const f2 = (u: number): number => {
      const z: Complex = { re: u, im: 0.0 };
      const cf2 = VMM.characteristicFunction(z, forwardLog, T, sigma, nu, theta);
      const expTerm: Complex = { re: Math.cos(-u * lnK), im: Math.sin(-u * lnK) };
      const num = VMM.mul(expTerm, cf2);
      const denom: Complex = { re: 0.0, im: u };
      return VMM.div(num, denom).re;
    };

    // Gil-Pelaez integration across panels
    const panels: ReadonlyArray<[number, number]> = [
      [1e-6, 8.0],
      [8.0, 35.0],
      [35.0, 100.0],
      [100.0, 250.0],
    ];

    let int1 = 0.0;
    let int2 = 0.0;
    for (const [a, b] of panels) {
      int1 += VMM.adaptiveQuadrature(f1, a, b, 1e-7, 16);
      int2 += VMM.adaptiveQuadrature(f2, a, b, 1e-7, 16);
    }

    const p1 = Math.min(1.0, Math.max(0.0, 0.5 + (1.0 / Math.PI) * int1));
    const p2 = Math.min(1.0, Math.max(0.0, 0.5 + (1.0 / Math.PI) * int2));

    const callPrice = Math.max(
      0.0,
      S0 * Math.exp(-q * T) * p1 - K * Math.exp(-r * T) * p2
    );
    const putPrice = Math.max(
      0.0,
      callPrice + K * Math.exp(-r * T) - S0 * Math.exp(-q * T)
    );

    const price = isCall ? callPrice : putPrice;

    return {
      price,
      p1,
      p2,
      driftCompensatorOmega: omega,
      moments,
      callPrice,
      putPrice,
    };
  }
}
