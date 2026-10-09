import { MertonJumpParams, MertonJumpResult } from './merton-jump-types';
import { MertonJumpMath } from './merton-jump-math';

export class MertonJumpEngine {
  public static calculate(params: MertonJumpParams): MertonJumpResult {
    if (params.spot <= 0.0 || params.strike <= 0.0) {
      throw new Error('spot and strike must be strictly positive');
    }
    if (params.timeToExpiry <= 0.0 || params.volatility <= 0.0) {
      throw new Error('timeToExpiry and volatility must be strictly positive');
    }
    if (params.jumpIntensity < 0.0 || params.jumpVol < 0.0) {
      throw new Error('jumpIntensity and jumpVol must be non-negative');
    }

    const q = params.dividendYield ?? 0.0;
    const series = MertonJumpMath.priceMertonSeries(params);

    const bsBench = MertonJumpMath.bsPrice(
      params.spot,
      params.strike,
      params.timeToExpiry,
      params.riskFreeRate,
      q,
      params.volatility
    );

    const dS = params.spot * 0.001;
    const upSeries = MertonJumpMath.priceMertonSeries({ ...params, spot: params.spot + dS });
    const dnSeries = MertonJumpMath.priceMertonSeries({ ...params, spot: params.spot - dS });
    const delta = (upSeries.call - dnSeries.call) / (2.0 * dS);
    const gamma = (upSeries.call - 2.0 * series.call + dnSeries.call) / (dS * dS);

    const dVol = 0.001;
    const upVol = MertonJumpMath.priceMertonSeries({ ...params, volatility: params.volatility + dVol });
    const vega = (upVol.call - series.call) / dVol;

    const dT = Math.min(params.timeToExpiry * 0.5, 1.0 / 365.0);
    const dntSeries = MertonJumpMath.priceMertonSeries({ ...params, timeToExpiry: Math.max(1e-4, params.timeToExpiry - dT) });
    const theta = (dntSeries.call - series.call) / dT;

    const dR = 0.0001;
    const upR = MertonJumpMath.priceMertonSeries({ ...params, riskFreeRate: params.riskFreeRate + dR });
    const rho = (upR.call - series.call) / dR;

    return {
      callPrice: series.call,
      putPrice: series.put,
      bsBenchmarkCall: bsBench.call,
      bsBenchmarkPut: bsBench.put,
      jumpComponentCall: series.call - bsBench.call,
      jumpComponentPut: series.put - bsBench.put,
      expectedJumpSizeKappa: series.kappa,
      effectiveIntensity: series.lambdaPrime,
      iterationsUsed: series.iterations,
      greeks: { delta, gamma, vega, theta, rho },
    };
  }
}
