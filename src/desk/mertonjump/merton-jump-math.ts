import { MertonJumpParams } from './merton-jump-types';

export class MertonJumpMath {
  public static stdNormPdf(x: number): number {
    return Math.exp(-0.5 * x * x) / Math.sqrt(2.0 * Math.PI);
  }

  public static stdNormCdf(x: number): number {
    const a1 = 0.254829592;
    const a2 = -0.284496736;
    const a3 = 1.421413741;
    const a4 = -1.453152027;
    const a5 = 1.061405429;
    const p = 0.3275911;

    const sign = x < 0 ? -1 : 1;
    const absX = Math.abs(x) / Math.SQRT2;
    const t = 1.0 / (1.0 + p * absX);
    const y = 1.0 - (((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t) * Math.exp(-absX * absX);

    return 0.5 * (1.0 + sign * y);
  }

  public static bsPrice(S: number, K: number, T: number, r: number, q: number, sigma: number): { call: number; put: number } {
    if (T <= 0.0) {
      return { call: Math.max(0.0, S - K), put: Math.max(0.0, K - S) };
    }
    const volSqrtT = Math.max(1e-12, sigma * Math.sqrt(T));
    const d1 = (Math.log(S / K) + (r - q + 0.5 * sigma * sigma) * T) / volSqrtT;
    const d2 = d1 - volSqrtT;

    const discountS = S * Math.exp(-q * T);
    const discountK = K * Math.exp(-r * T);

    const call = Math.max(0.0, discountS * this.stdNormCdf(d1) - discountK * this.stdNormCdf(d2));
    const put = Math.max(0.0, discountK * this.stdNormCdf(-d2) - discountS * this.stdNormCdf(-d1));
    return { call, put };
  }

  public static priceMertonSeries(params: MertonJumpParams): {
    call: number;
    put: number;
    iterations: number;
    kappa: number;
    lambdaPrime: number;
  } {
    const { spot: S, strike: K, timeToExpiry: T, riskFreeRate: r, volatility: sigma, jumpIntensity: lambda, jumpMean: muJ, jumpVol: sigmaJ } = params;
    const q = params.dividendYield ?? 0.0;
    const maxIter = params.maxIterations ?? 60;

    const kappa = Math.exp(muJ + 0.5 * sigmaJ * sigmaJ) - 1.0;
    const lambdaPrime = Math.max(0.0, lambda * (1.0 + kappa));
    const lambdaPrimeT = lambdaPrime * T;

    let totalCall = 0.0;
    let totalPut = 0.0;
    let weight = Math.exp(-lambdaPrimeT);
    let cumulativeWeight = 0.0;
    let n = 0;

    while (n < maxIter) {
      cumulativeWeight += weight;
      const sigmaN = Math.sqrt(Math.max(1e-8, sigma * sigma + (n * sigmaJ * sigmaJ) / T));
      const rn = r - lambda * kappa + (n * Math.log(1.0 + kappa)) / T;

      const bs = this.bsPrice(S, K, T, rn, q, sigmaN);
      totalCall += weight * bs.call;
      totalPut += weight * bs.put;

      n++;
      if (cumulativeWeight >= 1.0 - 1e-12 && n >= 5) {
        break;
      }
      weight = (weight * lambdaPrimeT) / n;
    }

    return { call: totalCall, put: totalPut, iterations: n, kappa, lambdaPrime };
  }
}
