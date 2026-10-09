import { Black76Params, Black76Result, Black76Greeks } from './black76-types.js';
import { Black76Math } from './black76-math.js';

export class Black76Engine {
  public static validate(params: Black76Params): void {
    const { forwardPrice, strikePrice, timeToExpiry, volatility, riskFreeRate } = params;
    if (forwardPrice <= 0) throw new Error('Forward price must be positive');
    if (strikePrice <= 0) throw new Error('Strike price must be positive');
    if (timeToExpiry <= 0) throw new Error('Time to expiry must be positive');
    if (volatility <= 0) throw new Error('Volatility must be positive');
    if (riskFreeRate < 0) throw new Error('Risk-free rate cannot be negative');
  }

  public static price(params: Black76Params): Black76Result {
    this.validate(params);
    const { forwardPrice: F, strikePrice: K, timeToExpiry: T, riskFreeRate: r, volatility: sigma, isCall } = params;

    const discount = Math.exp(-r * T);
    const sqrtT = Math.sqrt(T);
    const d1 = Black76Math.calculateD1(F, K, T, sigma);
    const d2 = Black76Math.calculateD2(d1, T, sigma);

    const Nd1 = Black76Math.normalCdf(d1);
    const Nd2 = Black76Math.normalCdf(d2);
    const nNd1 = Black76Math.normalCdf(-d1);
    const nNd2 = Black76Math.normalCdf(-d2);
    const pdfD1 = Black76Math.normalPdf(d1);

    let price = 0;
    let intrinsicValue = 0;
    let delta = 0;

    if (isCall) {
      price = discount * (F * Nd1 - K * Nd2);
      intrinsicValue = discount * Math.max(0, F - K);
      delta = discount * Nd1;
    } else {
      price = discount * (K * nNd2 - F * nNd1);
      intrinsicValue = discount * Math.max(0, K - F);
      delta = -discount * nNd1;
    }

    const gamma = (discount * pdfD1) / (F * sigma * sqrtT);
    const vega = discount * F * sqrtT * pdfD1;

    let theta = 0;
    if (isCall) {
      theta = -((discount * F * sigma * pdfD1) / (2 * sqrtT)) + r * discount * (F * Nd1 - K * Nd2);
    } else {
      theta = -((discount * F * sigma * pdfD1) / (2 * sqrtT)) + r * discount * (K * nNd2 - F * nNd1);
    }

    const rho = -T * price;

    const greeks: Black76Greeks = {
      delta,
      gamma,
      vega,
      theta,
      rho,
    };

    return {
      price: Math.max(0, price),
      intrinsicValue,
      timeValue: Math.max(0, price - intrinsicValue),
      d1,
      d2,
      greeks,
    };
  }
}
