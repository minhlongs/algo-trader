import { CirModelParams, CirBondResult, CirTermStructure } from './cir-types.js';
import { CirMath } from './cir-math.js';

export class CirEngine {
  public static validate(params: CirModelParams): void {
    if (!params.factors || params.factors.length === 0) {
      throw new Error('Factors must be non-empty');
    }
    if (params.recoveryRate < 0 || params.recoveryRate > 1) {
      throw new Error('Recovery rate must be in [0, 1]');
    }
    for (const f of params.factors) {
      if (f.speedKappa <= 0 || f.meanTheta <= 0 || f.sigma <= 0 || f.currentX < 0) {
        throw new Error('Factor parameters (kappa, theta, sigma) must be positive and currentX non-negative');
      }
      // Feller condition check: 2 * kappa * theta >= sigma^2
      if (2 * f.speedKappa * f.meanTheta < f.sigma * f.sigma) {
        // Warning or allowed with reflection/absorption; keep mathematical validity
      }
    }
  }

  public static priceBond(params: CirModelParams, tau: number): CirBondResult {
    this.validate(params);
    if (tau <= 0) throw new Error('Maturity tau must be strictly positive');

    const risklessWeights = params.factors.map(f => f.rateWeight);
    const risklessPrice = CirMath.priceZeroCoupon(params.factors, params.baseRate, risklessWeights, tau);
    const risklessYield = CirMath.calculateYield(risklessPrice, tau);

    // Defaultable weights under Fractional Recovery of Market Value: r + (1 - R)*lambda
    const lgd = 1 - params.recoveryRate;
    const defaultableWeights = params.factors.map(f => f.rateWeight + lgd * f.defaultWeight);
    const defaultableBase = params.baseRate + lgd * params.baseDefaultIntensity;
    const defaultablePrice = CirMath.priceZeroCoupon(params.factors, defaultableBase, defaultableWeights, tau);
    const defaultableYield = CirMath.calculateYield(defaultablePrice, tau);

    // Survival probability: discounting purely by lambda
    const survivalWeights = params.factors.map(f => f.defaultWeight);
    const survivalProbability = CirMath.priceZeroCoupon(
      params.factors,
      params.baseDefaultIntensity,
      survivalWeights,
      tau
    );

    const creditSpreadBps = (defaultableYield - risklessYield) * 10000;

    return {
      tau,
      risklessPrice,
      risklessYield,
      defaultablePrice,
      defaultableYield,
      creditSpreadBps: Math.max(0, creditSpreadBps),
      survivalProbability: Math.min(1.0, Math.max(0, survivalProbability)),
    };
  }

  public static buildCurve(params: CirModelParams, maturities: number[]): CirTermStructure {
    this.validate(params);
    if (!maturities || maturities.length === 0) {
      throw new Error('Maturities list must not be empty');
    }
    const curve = maturities.map(tau => this.priceBond(params, tau));
    return { maturities, curve };
  }
}
