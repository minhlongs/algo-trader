import { NormalDistribution } from '../holee/normal-distribution';
import { BjerksundBoundary } from './bjerksund-boundary';
import { BjerksundParameters, BjerksundResult } from './bjerksund-types';

export class BjerksundEngine {
  private phi(
    S: number,
    T: number,
    gamma: number,
    H: number,
    I: number,
    r: number,
    b: number,
    sigma: number
  ): number {
    const sigmaSq = sigma * sigma;
    const lambda = (-r + gamma * b + 0.5 * gamma * (gamma - 1.0) * sigmaSq) * T;
    const d = -(Math.log(S / H) + (b + (gamma - 0.5) * sigmaSq) * T) / (sigma * Math.sqrt(T));
    const kappa = (2.0 * b) / sigmaSq + (2.0 * gamma - 1.0);

    const term1 = Math.exp(lambda) * Math.pow(S, gamma);
    const cdf1 = NormalDistribution.cdf(d);
    const cdf2 = NormalDistribution.cdf(d - (2.0 * Math.log(I / S)) / (sigma * Math.sqrt(T)));

    return term1 * (cdf1 - Math.pow(I / S, kappa) * cdf2);
  }

  public priceAmericanOption(params: BjerksundParameters): BjerksundResult {
    const { spotPrice: S, strikePrice: K, timeToExpiryYears: T, optionType } = params;
    const r = params.riskFreeRatePct / 100.0;
    const q = params.continuousDividendYieldPct / 100.0;
    const sigma = params.volatilityPct / 100.0;

    if (S <= 0 || K <= 0) throw new Error('Spot and strike prices must be positive');
    if (T <= 0) throw new Error('Time to expiry must be positive');
    if (sigma <= 0) throw new Error('Volatility must be positive');

    const b = r - q; // Cost of carry
    const sigmaSq = sigma * sigma;
    const sqrtT = Math.sqrt(T);

    // European benchmark
    const d1 = (Math.log(S / K) + (b + 0.5 * sigmaSq) * T) / (sigma * sqrtT);
    const d2 = d1 - sigma * sqrtT;
    const eurCall = S * Math.exp((b - r) * T) * NormalDistribution.cdf(d1) - K * Math.exp(-r * T) * NormalDistribution.cdf(d2);
    const eurPut = K * Math.exp(-r * T) * NormalDistribution.cdf(-d2) - S * Math.exp((b - r) * T) * NormalDistribution.cdf(-d1);
    const europeanPrice = optionType === 'CALL' ? Math.max(0, eurCall) : Math.max(0, eurPut);

    if (optionType === 'PUT') {
      // Put-Call transformation symmetry: P(S, K, T, r, b, sigma) = C(K, S, T, r - b, -b, sigma)
      const transformedCall = this.priceAmericanOption({
        spotPrice: K,
        strikePrice: S,
        timeToExpiryYears: T,
        riskFreeRatePct: (r - b) * 100.0,
        continuousDividendYieldPct: -b * 100.0,
        volatilityPct: sigma * 100.0,
        optionType: 'CALL',
      });

      const americanPutPrice = transformedCall.americanPrice;
      const premium = Math.max(0, americanPutPrice - europeanPrice);

      return {
        americanPrice: Number(americanPutPrice.toFixed(4)),
        europeanPrice: Number(europeanPrice.toFixed(4)),
        earlyExercisePremium: Number(premium.toFixed(4)),
        triggerBoundaryI1: transformedCall.triggerBoundaryI1,
        triggerBoundaryI2: transformedCall.triggerBoundaryI2,
        betaExponent: transformedCall.betaExponent,
      };
    }

    // CALL Option
    if (b >= r) {
      // Never optimal to exercise American Call early when dividend <= 0 (b >= r)
      return {
        americanPrice: Number(europeanPrice.toFixed(4)),
        europeanPrice: Number(europeanPrice.toFixed(4)),
        earlyExercisePremium: 0.0,
        triggerBoundaryI1: Number((K * 10.0).toFixed(4)),
        triggerBoundaryI2: Number((K * 10.0).toFixed(4)),
        betaExponent: 1.0,
      };
    }

    const beta = BjerksundBoundary.calculateBeta(r, b, sigmaSq);
    const { I1, I2, t1 } = BjerksundBoundary.calculateBoundaries(K, T, r, b, sigma, beta);

    let americanPrice = europeanPrice;
    if (S >= I2) {
      americanPrice = S - K;
    } else {
      const alpha1 = (I1 - K) * Math.pow(I1, -beta);
      const alpha2 = (I2 - K) * Math.pow(I2, -beta);

      americanPrice =
        alpha2 * Math.pow(S, beta) -
        alpha2 * this.phi(S, t1, beta, I2, I2, r, b, sigma) +
        this.phi(S, t1, 1.0, I2, I2, r, b, sigma) -
        this.phi(S, t1, 1.0, I1, I2, r, b, sigma) -
        K * this.phi(S, t1, 0.0, I2, I2, r, b, sigma) +
        K * this.phi(S, t1, 0.0, I1, I2, r, b, sigma) +
        alpha1 * this.phi(S, t1, beta, I1, I2, r, b, sigma) -
        alpha1 * this.phi(S, T, beta, I1, I1, r, b, sigma) +
        this.phi(S, T, 1.0, I1, I1, r, b, sigma) -
        this.phi(S, T, 1.0, K, I1, r, b, sigma) -
        K * this.phi(S, T, 0.0, I1, I1, r, b, sigma) +
        K * this.phi(S, T, 0.0, K, I1, r, b, sigma);

      americanPrice = Math.max(S - K, Math.max(europeanPrice, americanPrice));
    }

    const premium = Math.max(0.0, americanPrice - europeanPrice);

    return {
      americanPrice: Number(americanPrice.toFixed(4)),
      europeanPrice: Number(europeanPrice.toFixed(4)),
      earlyExercisePremium: Number(premium.toFixed(4)),
      triggerBoundaryI1: Number(I1.toFixed(4)),
      triggerBoundaryI2: Number(I2.toFixed(4)),
      betaExponent: Number(beta.toFixed(4)),
    };
  }
}
