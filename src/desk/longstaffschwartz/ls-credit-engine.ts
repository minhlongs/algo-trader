import { LongstaffSchwartzParams, LongstaffSchwartzResult } from './ls-credit-types';
import { LongstaffSchwartzMath } from './ls-credit-math';

export class LongstaffSchwartzEngine {
  public static calculate(params: LongstaffSchwartzParams): LongstaffSchwartzResult {
    if (params.assetValue <= 0.0 || params.defaultBarrier <= 0.0) {
      throw new Error('assetValue and defaultBarrier must be strictly positive');
    }
    if (params.maturity <= 0.0) {
      throw new Error('maturity must be strictly positive');
    }
    if (params.writeDownFraction < 0.0 || params.writeDownFraction > 1.0) {
      throw new Error('writeDownFraction must be within [0, 1]');
    }
    if (params.meanReversionSpeed <= 0.0 || params.rateVol < 0.0 || params.assetVol <= 0.0) {
      throw new Error('meanReversionSpeed and assetVol must be positive');
    }
    if (params.correlation < -1.0 || params.correlation > 1.0) {
      throw new Error('correlation must be in [-1, 1]');
    }

    const { assetValue: V, defaultBarrier: VB, maturity: T, writeDownFraction: w } = params;
    const { shortRate: r0, meanReversionSpeed: a, longTermRate: b, rateVol: sigmaR, assetVol: sigmaV, correlation: rho } = params;

    const pRiskless = LongstaffSchwartzMath.vasicekBond(r0, T, a, b, sigmaR);
    const defaultPv = LongstaffSchwartzMath.defaultEventPresentValue(V, VB, T, r0, a, b, sigmaR, sigmaV, rho);
    const expectedLoss = w * defaultPv;
    const pDefaultable = Math.max(1e-12, pRiskless - expectedLoss);

    const yRiskless = -Math.log(pRiskless) / T;
    const yDefaultable = -Math.log(pDefaultable) / T;
    const spreadBps = Math.max(0.0, (yDefaultable - yRiskless) * 10000.0);
    const dToD = Math.log(V / VB) / (sigmaV * Math.sqrt(T));

    return {
      risklessBondPrice: pRiskless,
      defaultableBondPrice: pDefaultable,
      expectedLossDiscount: expectedLoss,
      defaultEventPv: defaultPv,
      risklessYield: yRiskless,
      defaultableYield: yDefaultable,
      creditSpreadBps: spreadBps,
      distanceToDefault: dToD,
    };
  }
}
