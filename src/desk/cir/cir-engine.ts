import { CirBondPricingResult, CirModelParameters, CirYieldCurveTenor } from './cir-types';

export class CirEngine {
  public priceZeroCouponBond(
    params: CirModelParameters,
    maturityTau: number,
    faceValueUsd = 100.0
  ): CirBondPricingResult {
    const { currentShortRateR0: r0, speedOfReversionKappa: kappa, longTermMeanTheta: theta, volatilitySigma: sigma } = params;

    if (maturityTau <= 0) throw new Error('Maturity must be positive');
    if (r0 < 0) throw new Error('Current short rate cannot be negative in CIR model');
    if (kappa <= 0) throw new Error('Kappa must be strictly positive');
    if (theta <= 0) throw new Error('Theta must be strictly positive');
    if (sigma <= 0) throw new Error('Volatility sigma must be strictly positive');
    if (faceValueUsd <= 0) throw new Error('Face value must be positive');

    const fellerNumerator = 2.0 * kappa * theta;
    const sigmaSq = sigma * sigma;
    const fellerRatio = fellerNumerator / sigmaSq;
    const fellerSatisfied = fellerRatio >= 1.0;

    const gamma = Math.sqrt(kappa * kappa + 2.0 * sigmaSq);
    const expNegGammaTau = Math.exp(-gamma * maturityTau);
    const oneMinusExp = 1.0 - expNegGammaTau;

    // Denominator D(tau) = (gamma + kappa) + (gamma - kappa) * exp(-gamma * tau)
    const D = (gamma + kappa) + (gamma - kappa) * expNegGammaTau;

    // B(tau) = 2 * (1 - exp(-gamma * tau)) / D(tau)
    const B = (2.0 * oneMinusExp) / D;

    // ln(A(tau)) = (2 * kappa * theta / sigma^2) * [ ln(2 * gamma) + (kappa - gamma) * tau / 2 - ln(D) ]
    const lnA = (fellerNumerator / sigmaSq) * (
      Math.log(2.0 * gamma) +
      ((kappa - gamma) * maturityTau) / 2.0 -
      Math.log(D)
    );

    const discountFactor = Math.exp(lnA - B * r0);
    const bondPrice = discountFactor * faceValueUsd;
    const yieldRate = (-Math.log(discountFactor) / maturityTau) * 100.0;

    // Instantaneous forward rate: f(tau) = r0 * B'(tau) + kappa * theta * B(tau)
    // where B'(tau) = (4 * gamma^2 * exp(-gamma * tau)) / D(tau)^2
    const bPrime = (4.0 * gamma * gamma * expNegGammaTau) / (D * D);
    const forwardRate = (r0 * bPrime + kappa * theta * B) * 100.0;

    return {
      maturityYears: maturityTau,
      bondPriceUsd: Number(bondPrice.toFixed(4)),
      continuouslyCompoundedYieldPct: Number(yieldRate.toFixed(4)),
      instantaneousForwardRatePct: Number(forwardRate.toFixed(4)),
      durationFactorB: Number(B.toFixed(6)),
      logScaleFactorLnA: Number(lnA.toFixed(6)),
      fellerConditionSatisfied: fellerSatisfied,
      fellerRatio: Number(fellerRatio.toFixed(4)),
    };
  }

  public generateYieldCurve(
    params: CirModelParameters,
    tenors: number[] = [0.25, 0.5, 1, 2, 3, 5, 7, 10, 20, 30]
  ): CirYieldCurveTenor[] {
    return tenors.map((tenor) => {
      const result = this.priceZeroCouponBond(params, tenor);
      return {
        tenorYears: tenor,
        yieldPct: result.continuouslyCompoundedYieldPct,
        forwardRatePct: result.instantaneousForwardRatePct,
        bondPriceUsd: result.bondPriceUsd,
      };
    });
  }
}
