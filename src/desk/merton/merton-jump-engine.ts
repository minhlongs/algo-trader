import { MertonJumpDiffusionParameters, MertonOptionPriceResult } from './merton-types';

export class MertonJumpEngine {
  private normalCdf(x: number): number {
    const a1 = 0.254829592;
    const a2 = -0.284496736;
    const a3 = 1.421413741;
    const a4 = -1.453152027;
    const a5 = 1.061405429;
    const p = 0.3275911;

    const sign = x < 0 ? -1 : 1;
    const absX = Math.abs(x) / Math.SQRT2;
    const t = 1.0 / (1.0 + p * absX);
    const erf = 1.0 - (((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t) * Math.exp(-absX * absX);

    return 0.5 * (1.0 + sign * erf);
  }

  private blackScholesCall(S: number, K: number, T: number, r: number, sigma: number): number {
    if (sigma <= 1e-8 || T <= 1e-8) {
      return Math.max(0, S - K * Math.exp(-r * T));
    }
    const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
    const d2 = d1 - sigma * Math.sqrt(T);
    return S * this.normalCdf(d1) - K * Math.exp(-r * T) * this.normalCdf(d2);
  }

  public priceOption(params: MertonJumpDiffusionParameters, maxTerms = 50): MertonOptionPriceResult {
    const {
      spotPrice: S,
      strikePrice: K,
      timeToExpiryYears: T,
      riskFreeRatePct,
      diffusionVolatilityPct,
      jumpIntensityLambda: lambda,
      meanJumpSizeMu: muJ,
      jumpVolatilityDelta: deltaJ,
    } = params;

    if (S <= 0 || K <= 0 || T <= 0) {
      throw new Error('Prices and time to maturity must be positive');
    }
    if (lambda < 0 || deltaJ < 0) {
      throw new Error('Jump parameters must be non-negative');
    }

    const r = riskFreeRatePct / 100.0;
    const sigma = diffusionVolatilityPct / 100.0;

    // Expected jump ratio kappa = E[Y - 1] = exp(muJ + 0.5 * deltaJ^2) - 1
    const kappa = Math.exp(muJ + 0.5 * deltaJ * deltaJ) - 1.0;
    const lambdaPrime = lambda * (1.0 + kappa);

    let callSum = 0;
    let factorialN = 1;
    let nTermsUsed = 0;

    for (let n = 0; n < maxTerms; n++) {
      if (n > 0) factorialN *= n;

      const poissonWeight = (Math.exp(-lambdaPrime * T) * Math.pow(lambdaPrime * T, n)) / factorialN;
      if (poissonWeight < 1e-12 && n > 5) break;

      const sigmaN = Math.sqrt(sigma * sigma + (n * deltaJ * deltaJ) / T);
      const rn = r - lambda * kappa + (n * Math.log(1.0 + kappa)) / T;

      const bsCall = this.blackScholesCall(S, K, T, rn, sigmaN);
      callSum += poissonWeight * bsCall;
      nTermsUsed++;
    }

    const bsBenchmarkCall = this.blackScholesCall(S, K, T, r, sigma);
    // Put-call parity: P = C - S + K * exp(-r * T)
    const putPrice = callSum - S + K * Math.exp(-r * T);

    return {
      callPriceUsd: Number(callSum.toFixed(4)),
      putPriceUsd: Number(Math.max(0, putPrice).toFixed(4)),
      jumpComponentContributionUsd: Number((callSum - bsBenchmarkCall).toFixed(4)),
      blackScholesBenchmarkCallUsd: Number(bsBenchmarkCall.toFixed(4)),
      truncatedPoissonTermsCount: nTermsUsed,
    };
  }
}
