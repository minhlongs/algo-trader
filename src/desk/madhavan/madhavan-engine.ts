import { MadhavanParams, MadhavanResult } from './madhavan-types';
import { MadhavanMath } from './madhavan-math';

export class MadhavanEngine {
  public static calculate(params: MadhavanParams): MadhavanResult {
    const { prices, orderSigns } = params;

    if (!prices || !orderSigns || prices.length < 5) {
      throw new Error('prices and orderSigns must contain at least 5 trade observations');
    }
    if (prices.length !== orderSigns.length) {
      throw new Error('prices and orderSigns arrays must have identical length');
    }

    const N = prices.length;
    const deltaP: number[] = [];
    const xCurr: number[] = [];
    const xLag: number[] = [];

    for (let t = 1; t < N; t++) {
      deltaP.push(prices[t] - prices[t - 1]);
      xCurr.push(orderSigns[t]);
      xLag.push(orderSigns[t - 1]);
    }

    const rho = MadhavanMath.calculateTradeAutocorrelation(orderSigns);
    const ols = MadhavanMath.estimateOls(deltaP, xCurr, xLag);
    const decomp = MadhavanMath.decomposeSpread(ols.beta1, ols.beta2, rho);

    return {
      thetaInformationAsymmetry: decomp.theta,
      phiOrderProcessingCost: decomp.phi,
      autocorrelationRho: rho,
      impliedHalfSpread: decomp.s,
      impliedFullSpread: decomp.s * 2.0,
      adverseSelectionShare: decomp.alphaInfo,
      orderProcessingShare: 1.0 - decomp.alphaInfo,
      regressionR2: ols.r2,
    };
  }
}
