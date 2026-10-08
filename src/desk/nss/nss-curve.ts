import { NssParameters, NssYieldPoint } from './nss-types';

export class NssCurve {
  public static calculatePoint(params: NssParameters, maturityYears: number): NssYieldPoint {
    const m = Math.max(1e-6, maturityYears);
    const { beta0, beta1, beta2, beta3, tau1, tau2 } = params;

    if (tau1 <= 0 || tau2 <= 0) {
      throw new Error('NSS scale parameters tau1 and tau2 must be strictly positive');
    }

    const mTau1 = m / tau1;
    const exp1 = Math.exp(-mTau1);
    const term1 = (1.0 - exp1) / mTau1;
    const term2 = term1 - exp1;

    const mTau2 = m / tau2;
    const exp2 = Math.exp(-mTau2);
    const term3 = (1.0 - exp2) / mTau2 - exp2;

    const zeroRate = beta0 + beta1 * term1 + beta2 * term2 + beta3 * term3;

    // Instantaneous forward rate f(m)
    const forwardRate =
      beta0 +
      beta1 * exp1 +
      beta2 * (mTau1 * exp1) +
      beta3 * (mTau2 * exp2);

    const discountFactor = Math.exp(-(zeroRate / 100.0) * m);

    return {
      maturityYears: Number(m.toFixed(4)),
      zeroRatePct: Number(zeroRate.toFixed(4)),
      instantaneousForwardRatePct: Number(forwardRate.toFixed(4)),
      discountFactor: Number(discountFactor.toFixed(6)),
    };
  }
}
