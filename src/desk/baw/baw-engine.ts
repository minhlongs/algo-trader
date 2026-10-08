import { NormalDistribution } from '../holee/normal-distribution';
import { BawOptionParameters, BawOptionResult } from './baw-types';

export class BawEngine {
  public priceAmericanOption(params: BawOptionParameters): BawOptionResult {
    const { spotPrice: S, strikePrice: K, timeToExpiryYears: T, optionType } = params;
    const r = params.riskFreeRatePct / 100.0;
    const q = params.continuousDividendYieldPct / 100.0;
    const sigma = params.volatilityPct / 100.0;

    if (S <= 0 || K <= 0) throw new Error('Spot and strike prices must be positive');
    if (T <= 0) throw new Error('Time to expiry must be positive');
    if (sigma <= 0) throw new Error('Volatility must be positive');

    const sigmaSq = sigma * sigma;
    const b = r - q; // Cost of carry
    const k1 = 1.0 - Math.exp(-r * T);
    const m = (2.0 * r) / sigmaSq;
    const n = (2.0 * b) / sigmaSq;

    // European benchmark price
    const sqrtT = Math.sqrt(T);
    const d1 = (Math.log(S / K) + (b + 0.5 * sigmaSq) * T) / (sigma * sqrtT);
    const d2 = d1 - sigma * sqrtT;
    const eurCall = S * Math.exp(-q * T) * NormalDistribution.cdf(d1) - K * Math.exp(-r * T) * NormalDistribution.cdf(d2);
    const eurPut = K * Math.exp(-r * T) * NormalDistribution.cdf(-d2) - S * Math.exp(-q * T) * NormalDistribution.cdf(-d1);
    const europeanPrice = optionType === 'CALL' ? Math.max(0, eurCall) : Math.max(0, eurPut);

    let criticalS = K;
    let qExp = 0.0;
    let americanPrice = europeanPrice;
    let iterations = 0;

    if (optionType === 'CALL') {
      qExp = (-(n - 1.0) + Math.sqrt(Math.pow(n - 1.0, 2) + (4.0 * m) / k1)) / 2.0;

      // When cost of carry b >= r (i.e. q <= 0), American Call equals European Call
      if (q <= 0) {
        return {
          americanPrice: Number(europeanPrice.toFixed(4)),
          europeanPrice: Number(europeanPrice.toFixed(4)),
          earlyExercisePremium: 0.0,
          criticalSpotPrice: Number((K * 10.0).toFixed(4)),
          qExponent: Number(qExp.toFixed(4)),
          iterations: 0,
        };
      }

      // Newton-Raphson for S* (critical spot)
      let sStar = K;
      for (let iter = 0; iter < 50; iter++) {
        iterations++;
        const d1Star = (Math.log(sStar / K) + (b + 0.5 * sigmaSq) * T) / (sigma * sqrtT);
        const d2Star = d1Star - sigma * sqrtT;
        const cStar = sStar * Math.exp(-q * T) * NormalDistribution.cdf(d1Star) - K * Math.exp(-r * T) * NormalDistribution.cdf(d2Star);

        const nd1Star = NormalDistribution.cdf(d1Star);
        const gVal = (sStar - K) - cStar - (sStar / qExp) * (1.0 - Math.exp(-q * T) * nd1Star);
        if (Math.abs(gVal) < 1e-6) {
          sStar = Math.max(K, sStar);
          break;
        }

        const npd1Star = NormalDistribution.pdf(d1Star);
        const gPrime =
          (1.0 - 1.0 / qExp) * (1.0 - Math.exp(-q * T) * nd1Star) +
          (1.0 / qExp) * Math.exp(-q * T) * (npd1Star / (sigma * sqrtT));

        sStar = Math.max(K, sStar - gVal / gPrime);
      }
      criticalS = sStar;

      if (S >= criticalS) {
        americanPrice = S - K;
      } else {
        const d1Star = (Math.log(criticalS / K) + (b + 0.5 * sigmaSq) * T) / (sigma * sqrtT);
        const a2 = (criticalS / qExp) * (1.0 - Math.exp(-q * T) * NormalDistribution.cdf(d1Star));
        americanPrice = europeanPrice + a2 * Math.pow(S / criticalS, qExp);
      }
    } else {
      // PUT Option
      qExp = (-(n - 1.0) - Math.sqrt(Math.pow(n - 1.0, 2) + (4.0 * m) / k1)) / 2.0;

      let sStar = K;
      for (let iter = 0; iter < 50; iter++) {
        iterations++;
        const d1Star = (Math.log(sStar / K) + (b + 0.5 * sigmaSq) * T) / (sigma * sqrtT);
        const d2Star = d1Star - sigma * sqrtT;
        const pStar = K * Math.exp(-r * T) * NormalDistribution.cdf(-d2Star) - sStar * Math.exp(-q * T) * NormalDistribution.cdf(-d1Star);

        const nd1Star = NormalDistribution.cdf(-d1Star);
        const gVal = (K - sStar) - pStar + (sStar / qExp) * (1.0 - Math.exp(-q * T) * nd1Star);
        if (Math.abs(gVal) < 1e-6) {
          sStar = Math.min(K, sStar);
          break;
        }

        const npd1Star = NormalDistribution.pdf(d1Star);
        const gPrime =
          -(1.0 - 1.0 / qExp) * (1.0 - Math.exp(-q * T) * nd1Star) -
          (1.0 / qExp) * Math.exp(-q * T) * (npd1Star / (sigma * sqrtT)) - 1.0;

        sStar = Math.max(1e-4, Math.min(K, sStar - gVal / gPrime));
      }
      criticalS = sStar;

      if (S <= criticalS) {
        americanPrice = K - S;
      } else {
        const d1Star = (Math.log(criticalS / K) + (b + 0.5 * sigmaSq) * T) / (sigma * sqrtT);
        const a1 = -(criticalS / qExp) * (1.0 - Math.exp(-q * T) * NormalDistribution.cdf(-d1Star));
        americanPrice = europeanPrice + a1 * Math.pow(S / criticalS, qExp);
      }
    }

    const premium = Math.max(0.0, americanPrice - europeanPrice);

    return {
      americanPrice: Number(americanPrice.toFixed(4)),
      europeanPrice: Number(europeanPrice.toFixed(4)),
      earlyExercisePremium: Number(premium.toFixed(4)),
      criticalSpotPrice: Number(criticalS.toFixed(4)),
      qExponent: Number(qExp.toFixed(4)),
      iterations,
    };
  }
}
