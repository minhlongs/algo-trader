import { DuffieSingletonParams, DuffieSingletonResult, DuffieSingletonCurvePoint } from './duffie-singleton-types';
import { DuffieSingletonMath } from './duffie-singleton-math';

export class DuffieSingletonEngine {
  public static calculate(params: DuffieSingletonParams): DuffieSingletonResult {
    const {
      riskFreeRate: r,
      currentIntensity: lambda0,
      meanReversion: kappa,
      longTermIntensity: theta,
      volatility: sigma,
      lossGivenDefault: L,
      maturities,
    } = params;

    if (lambda0 <= 0 || kappa <= 0 || theta <= 0 || sigma < 0 || L <= 0 || L > 1.0) {
      throw new Error('Hazard intensity, mean reversion, long-term intensity, and LGD must be strictly positive with LGD <= 1.0');
    }

    if (!maturities || maturities.length === 0) {
      throw new Error('Maturities list must not be empty');
    }

    const curve: DuffieSingletonCurvePoint[] = maturities.map((T) => {
      if (T <= 0) {
        throw new Error('All maturities must be strictly positive');
      }

      const p0 = Math.exp(-r * T);

      // Defaultable bond discounting under Recovery of Market Value (RMV): c = L
      const { A: AD, B: BD } = DuffieSingletonMath.calcAffineCoefficients(T, L, kappa, theta, sigma);
      const pd = p0 * AD * Math.exp(-BD * lambda0);

      // Instantaneous / annualized yield spread in bps
      const creditSpreadBps = Math.max(0.0, (-Math.log(Math.max(1e-15, pd / p0)) / T) * 10000.0);

      // Survival probability curve: c = 1.0
      const { A: AS, B: BS } = DuffieSingletonMath.calcAffineCoefficients(T, 1.0, kappa, theta, sigma);
      const survivalProb = Math.max(0.0, Math.min(1.0, AS * Math.exp(-BS * lambda0)));
      const cumulativeDefaultProb = 1.0 - survivalProb;

      // Par CDS spread calculation via numerical integration of protection and premium legs
      const parCdsSpreadBps = this.calcParCdsSpread(T, r, lambda0, kappa, theta, sigma, L);

      return {
        maturity: T,
        defaultFreeBondPrice: p0,
        defaultableBondPrice: pd,
        creditSpreadBps,
        survivalProbability: survivalProb,
        cumulativeDefaultProb,
        parCdsSpreadBps,
      };
    });

    const instantaneousSpreadBps = lambda0 * L * 10000.0;
    const longTermSpreadBps = theta * L * 10000.0;
    const fellerConditionSatisfied = DuffieSingletonMath.isFellerConditionSatisfied(kappa, theta, sigma);

    return {
      curve,
      instantaneousSpreadBps,
      longTermSpreadBps,
      fellerConditionSatisfied,
    };
  }

  private static calcParCdsSpread(
    T: number,
    r: number,
    lambda0: number,
    kappa: number,
    theta: number,
    sigma: number,
    L: number
  ): number {
    const steps = 40;
    const dt = T / steps;
    let protLeg = 0.0;
    let premLeg = 0.0;

    let prevQ = 1.0;
    for (let i = 1; i <= steps; i++) {
      const t = i * dt;
      const df = Math.exp(-r * t);
      const { A, B } = DuffieSingletonMath.calcAffineCoefficients(t, 1.0, kappa, theta, sigma);
      const q = Math.max(0.0, Math.min(1.0, A * Math.exp(-B * lambda0)));

      // Marginal default probability during (t - dt, t)
      const dQ = Math.max(0.0, prevQ - q);
      const midDf = Math.exp(-r * (t - 0.5 * dt));

      protLeg += L * midDf * dQ;
      premLeg += df * q * dt;

      prevQ = q;
    }

    if (premLeg <= 1e-12) {
      return lambda0 * L * 10000.0;
    }

    return (protLeg / premLeg) * 10000.0;
  }
}
