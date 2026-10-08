import { DefaultableBondParams, CreditRiskMetrics } from './jarrow-turnbull-types';

export class JarrowTurnbullEngine {
  /**
   * Prices a defaultable bond using the Jarrow-Turnbull (1995) reduced-form model.
   * Assumes constant hazard rate and recovery of face value (Fractional Recovery of Treasury).
   */
  public static calculateDefaultableBond(params: DefaultableBondParams): CreditRiskMetrics {
    const r = params.riskFreeRate;
    const lambda = params.hazardRate;
    const R = params.recoveryRate;
    const T = params.timeToMaturity;

    // Survival probability under hazard rate lambda
    const survivalProb = Math.exp(-lambda * T);
    const defaultProb = 1.0 - survivalProb;

    let defaultablePrice = 0.0;
    let riskFreePrice = 0.0;
    const F = params.faceValue;

    if (params.couponRate && params.paymentFrequency && params.couponRate > 0) {
      const coupon = (F * params.couponRate) / params.paymentFrequency;
      const numPayments = Math.floor(T * params.paymentFrequency);
      const dt = 1.0 / params.paymentFrequency;

      for (let i = 1; i <= numPayments; i++) {
        const t = i * dt;
        // Discount factor for risk-free
        const df = Math.exp(-r * t);
        riskFreePrice += coupon * df;

        // Jarrow-Turnbull fractional recovery assumption on coupons (usually 0 recovery on lost coupons)
        // For simplicity, we assume recovery applies only to face value at maturity, 
        // coupons are lost if default occurs before payment date.
        const surv = Math.exp(-lambda * t);
        defaultablePrice += coupon * df * surv;
      }
      
      const dfT = Math.exp(-r * T);
      riskFreePrice += F * dfT;
      // Defaultable Principal = Promised payment if survive + Recovery if default
      // Note: A more rigorous JT integrates default density. Here we use the simplified fractional recovery approximation:
      defaultablePrice += F * dfT * (survivalProb + R * defaultProb);

    } else {
      // Zero coupon bond
      const df = Math.exp(-r * T);
      riskFreePrice = F * df;
      defaultablePrice = F * df * (survivalProb + R * defaultProb);
    }

    // Expected loss on the bond
    const expectedLoss = riskFreePrice - defaultablePrice;

    // Yield to maturity of zero coupon approximation for credit spread
    let creditSpread = 0.0;
    if (T > 0 && riskFreePrice > 0 && defaultablePrice > 0) {
      if (params.couponRate && params.couponRate > 0) {
        // Approximate spread via continuous yield diff
        // y = -ln(P/F) / T if zero coupon. For coupon bond, we estimate the continuous spread.
        // It's precisely lambda * (1 - R) for zero coupon. We return the exact continuous spread equivalent for the zero bond.
        creditSpread = lambda * (1.0 - R);
      } else {
        const yF = -Math.log(riskFreePrice / F) / T;
        const yD = -Math.log(defaultablePrice / F) / T;
        creditSpread = yD - yF;
      }
    }

    return {
      survivalProbability: survivalProb,
      defaultProbability: defaultProb,
      expectedLoss,
      creditSpread,
      bondPrice: defaultablePrice,
      riskFreePrice,
    };
  }
}
