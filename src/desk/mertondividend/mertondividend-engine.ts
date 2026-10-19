import {
  MertonDividendParams,
  MertonDividendResult,
  MertonDividendGreeks,
} from './mertondividend-types.js';
import { MertonDividendMath } from './mertondividend-math.js';

export class MertonDividendEngine {
  public static validate(params: MertonDividendParams): void {
    if (params.spot <= 0) throw new Error('Spot price must be positive');
    if (params.strike <= 0) throw new Error('Strike price must be positive');
    if (params.timeToExpiry <= 0) throw new Error('Time to expiry must be positive');
    if (params.volatility <= 0) throw new Error('Volatility must be positive');
  }

  public static price(params: MertonDividendParams): MertonDividendResult {
    this.validate(params);
    const { spot: S, strike: K, timeToExpiry: T, riskFreeRate: r, dividendYield: q, volatility: sigma, isCall } = params;

    const { d1, d2 } = MertonDividendMath.calculateD1D2(S, K, T, r, q, sigma);
    const eqT = Math.exp(-q * T);
    const erT = Math.exp(-r * T);
    const sqrtT = Math.sqrt(T);

    const Nd1 = MertonDividendMath.normalCdf(d1);
    const Nd2 = MertonDividendMath.normalCdf(d2);
    const nNd1 = MertonDividendMath.normalCdf(-d1);
    const nNd2 = MertonDividendMath.normalCdf(-d2);
    const pdfD1 = MertonDividendMath.normalPdf(d1);

    let price = 0;
    let delta = 0;
    let theta = 0;
    let rho = 0;
    let dividendRho = 0;

    const gamma = (eqT * pdfD1) / (S * sigma * sqrtT);
    const vega = S * eqT * sqrtT * pdfD1;

    if (isCall) {
      price = S * eqT * Nd1 - K * erT * Nd2;
      delta = eqT * Nd1;
      theta = -((S * sigma * eqT * pdfD1) / (2 * sqrtT)) + q * S * eqT * Nd1 - r * K * erT * Nd2;
      rho = K * T * erT * Nd2;
      dividendRho = -T * S * eqT * Nd1;
    } else {
      price = K * erT * nNd2 - S * eqT * nNd1;
      delta = -eqT * nNd1;
      theta = -((S * sigma * eqT * pdfD1) / (2 * sqrtT)) - q * S * eqT * nNd1 + r * K * erT * nNd2;
      rho = -K * T * erT * nNd2;
      dividendRho = T * S * eqT * nNd1;
    }

    const intrinsicValue = isCall ? Math.max(0, S - K) : Math.max(0, K - S);
    const timeValue = Math.max(0, price - intrinsicValue);

    const greeks: MertonDividendGreeks = {
      delta,
      gamma,
      vega,
      theta,
      rho,
      dividendRho,
    };

    return {
      price,
      greeks,
      intrinsicValue,
      timeValue,
    };
  }
}
