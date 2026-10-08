import { NormalDistribution } from '../holee/normal-distribution';
import {
  MertonYieldGreeks,
  MertonYieldOptionParameters,
  MertonYieldOptionResult,
} from './merton-yield-types';

export class MertonYieldEngine {
  public priceOption(params: MertonYieldOptionParameters): MertonYieldOptionResult {
    const { spotPrice: S, strikePrice: K, timeToExpiryYears: tau } = params;
    const r = params.riskFreeRatePct / 100.0;
    const q = params.continuousDividendYieldPct / 100.0;
    const sigma = params.volatilityPct / 100.0;

    if (S <= 0 || K <= 0) throw new Error('Spot and strike prices must be strictly positive');
    if (tau <= 0) throw new Error('Time to expiry must be strictly positive');
    if (sigma <= 0) throw new Error('Volatility must be strictly positive');

    const sqrtTau = Math.sqrt(tau);
    const discR = Math.exp(-r * tau);
    const discQ = Math.exp(-q * tau);
    const forward = S * Math.exp((r - q) * tau);

    const d1 = (Math.log(S / K) + (r - q + 0.5 * sigma * sigma) * tau) / (sigma * sqrtTau);
    const d2 = d1 - sigma * sqrtTau;

    const nD1 = NormalDistribution.cdf(d1);
    const nD2 = NormalDistribution.cdf(d2);
    const nNegD1 = NormalDistribution.cdf(-d1);
    const nNegD2 = NormalDistribution.cdf(-d2);
    const pdfD1 = NormalDistribution.pdf(d1);

    const callPrice = S * discQ * nD1 - K * discR * nD2;
    const putPrice = K * discR * nNegD2 - S * discQ * nNegD1;

    // Greeks analytical formulations
    const callDelta = discQ * nD1;
    const putDelta = discQ * (nD1 - 1.0);
    const gamma = (discQ * pdfD1) / (S * sigma * sqrtTau);
    const vega = (S * discQ * sqrtTau * pdfD1) / 100.0; // 1% vol shift

    const callTheta =
      (-(S * sigma * discQ * pdfD1) / (2.0 * sqrtTau) +
        q * S * discQ * nD1 -
        r * K * discR * nD2) /
      365.0; // 1-day theta
    const putTheta =
      (-(S * sigma * discQ * pdfD1) / (2.0 * sqrtTau) -
        q * S * discQ * nNegD1 +
        r * K * discR * nNegD2) /
      365.0;

    const callRho = (K * tau * discR * nD2) / 100.0; // 1% rate shift
    const putRho = (-K * tau * discR * nNegD2) / 100.0;

    const callPhi = (-tau * S * discQ * nD1) / 100.0; // 1% dividend shift
    const putPhi = (tau * S * discQ * nNegD1) / 100.0;

    const vanna = (-discQ * pdfD1 * (d2 / sigma)) / 100.0;
    const volga = (vega * (d1 * d2) / sigma) / 100.0;

    const greeks: MertonYieldGreeks = {
      callDelta: Number(callDelta.toFixed(6)),
      putDelta: Number(putDelta.toFixed(6)),
      gamma: Number(gamma.toFixed(6)),
      vega: Number(vega.toFixed(4)),
      callTheta: Number(callTheta.toFixed(4)),
      putTheta: Number(putTheta.toFixed(4)),
      callRho: Number(callRho.toFixed(4)),
      putRho: Number(putRho.toFixed(4)),
      callDividendRhoPhi: Number(callPhi.toFixed(4)),
      putDividendRhoPhi: Number(putPhi.toFixed(4)),
      vanna: Number(vanna.toFixed(6)),
      volga: Number(volga.toFixed(6)),
    };

    return {
      callPrice: Number(Math.max(0, callPrice).toFixed(4)),
      putPrice: Number(Math.max(0, putPrice).toFixed(4)),
      d1: Number(d1.toFixed(4)),
      d2: Number(d2.toFixed(4)),
      forwardPrice: Number(forward.toFixed(4)),
      greeks,
    };
  }
}
