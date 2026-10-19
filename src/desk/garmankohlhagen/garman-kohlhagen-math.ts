import { GarmanKohlhagenGreeks, OptionType } from './garman-kohlhagen-types';

export class GarmanKohlhagenMath {
  public static normalPdf(x: number): number {
    return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
  }

  public static normalCdf(x: number): number {
    if (x === 0.0) return 0.5;
    if (x < -10.0) return 0.0;
    if (x > 10.0) return 1.0;
    const z = Math.abs(x);
    const t = 1.0 / (1.0 + 0.2316419 * z);
    const poly =
      t * (0.319381530 +
        t * (-0.356563782 +
          t * (1.781477937 +
            t * (-1.821255978 +
              t * 1.330274429))));
    const cdf = 1.0 - this.normalPdf(z) * poly;
    return x >= 0.0 ? cdf : 1.0 - cdf;
  }

  public static computeD1D2(
    s: number,
    k: number,
    t: number,
    rd: number,
    rf: number,
    vol: number
  ): { d1: number; d2: number } {
    const sqrtT = Math.sqrt(t);
    const d1 = (Math.log(s / k) + (rd - rf + 0.5 * vol * vol) * t) / (vol * sqrtT);
    const d2 = d1 - vol * sqrtT;
    return { d1, d2 };
  }

  public static calculatePrice(
    s: number,
    k: number,
    t: number,
    rd: number,
    rf: number,
    vol: number,
    type: OptionType
  ): number {
    if (t <= 0) {
      return type === 'call' ? Math.max(0, s - k) : Math.max(0, k - s);
    }
    const { d1, d2 } = this.computeD1D2(s, k, t, rd, rf, vol);
    const dfForeign = Math.exp(-rf * t);
    const dfDomestic = Math.exp(-rd * t);

    if (type === 'call') {
      return s * dfForeign * this.normalCdf(d1) - k * dfDomestic * this.normalCdf(d2);
    }
    return k * dfDomestic * this.normalCdf(-d2) - s * dfForeign * this.normalCdf(-d1);
  }

  public static calculateGreeks(
    s: number,
    k: number,
    t: number,
    rd: number,
    rf: number,
    vol: number,
    type: OptionType
  ): GarmanKohlhagenGreeks {
    if (t <= 0) {
      const isCall = type === 'call';
      return {
        delta: isCall ? (s > k ? 1 : 0) : (s < k ? -1 : 0),
        gamma: 0,
        vega: 0,
        theta: 0,
        domesticRho: 0,
        foreignRho: 0,
        dualDelta: isCall ? (s > k ? 1 : 0) : (s < k ? -1 : 0),
      };
    }

    const { d1, d2 } = this.computeD1D2(s, k, t, rd, rf, vol);
    const sqrtT = Math.sqrt(t);
    const dfForeign = Math.exp(-rf * t);
    const dfDomestic = Math.exp(-rd * t);
    const nd1 = this.normalCdf(d1);
    const nd2 = this.normalCdf(d2);
    const nPrimed1 = this.normalPdf(d1);

    const delta = type === 'call' ? dfForeign * nd1 : -dfForeign * (1.0 - nd1);
    const gamma = (dfForeign * nPrimed1) / (s * vol * sqrtT);
    const vega = s * dfForeign * sqrtT * nPrimed1;

    const term1 = -(s * vol * dfForeign * nPrimed1) / (2.0 * sqrtT);
    let theta: number;
    let domesticRho: number;
    let foreignRho: number;
    let dualDelta: number;

    if (type === 'call') {
      theta = term1 + rf * s * dfForeign * nd1 - rd * k * dfDomestic * nd2;
      domesticRho = k * t * dfDomestic * nd2;
      foreignRho = -s * t * dfForeign * nd1;
      dualDelta = dfDomestic * nd2;
    } else {
      theta = term1 - rf * s * dfForeign * (1.0 - nd1) + rd * k * dfDomestic * (1.0 - nd2);
      domesticRho = -k * t * dfDomestic * (1.0 - nd2);
      foreignRho = s * t * dfForeign * (1.0 - nd1);
      dualDelta = -dfDomestic * (1.0 - nd2);
    }

    return { delta, gamma, vega, theta, domesticRho, foreignRho, dualDelta };
  }

  public static solveImpliedVol(
    s: number,
    k: number,
    t: number,
    rd: number,
    rf: number,
    targetPrice: number,
    type: OptionType,
    initialGuess = 0.20,
    tolerance = 1e-8,
    maxIter = 100
  ): number {
    let sigma = Math.max(0.001, initialGuess);
    for (let i = 0; i < maxIter; i++) {
      const price = this.calculatePrice(s, k, t, rd, rf, sigma, type);
      const diff = price - targetPrice;
      if (Math.abs(diff) < tolerance) {
        return sigma;
      }
      const greeks = this.calculateGreeks(s, k, t, rd, rf, sigma, type);
      const vega = Math.max(1e-6, greeks.vega);
      const step = diff / vega;
      sigma = Math.min(5.0, Math.max(0.0001, sigma - step));
    }
    return sigma;
  }
}
