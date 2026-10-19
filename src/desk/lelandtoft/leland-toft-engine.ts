import { LelandToftParams, LelandToftResult } from './leland-toft-types';
import { LelandToftMath } from './leland-toft-math';

export class LelandToftEngine {
  public static calculate(params: LelandToftParams): LelandToftResult {
    const {
      assetValue: V,
      coupon: C,
      principal: P,
      riskFreeRate: r,
      assetVolatility: sigma,
      taxRate: tau,
      bankruptcyCostRate: alpha,
    } = params;
    const delta = params.payoutRate ?? 0.0;

    if (V <= 0) throw new Error('assetValue must be > 0');
    if (C <= 0 || P <= 0) throw new Error('coupon and principal must be > 0');
    if (r <= 0) throw new Error('riskFreeRate must be > 0');
    if (sigma <= 0) throw new Error('assetVolatility must be > 0');
    if (tau < 0 || tau >= 1.0) throw new Error('taxRate must be in [0, 1)');
    if (alpha < 0 || alpha >= 1.0) throw new Error('bankruptcyCostRate must be in [0, 1)');

    const val = LelandToftMath.calculateValuation(V, C, P, r, delta, sigma, tau, alpha);
    const leverageRatio = Math.min(1.0, Math.max(0.0, val.debtValue / val.firmValue));

    return {
      firmValue: val.firmValue,
      debtValue: val.debtValue,
      equityValue: val.equityValue,
      endogenousDefaultBoundary: val.VB,
      defaultDiscountFactor: val.pB,
      taxShieldValue: val.taxShield,
      bankruptcyCostValue: val.bankruptcyCost,
      creditSpreadBps: val.creditSpreadBps,
      leverageRatio,
    };
  }
}
