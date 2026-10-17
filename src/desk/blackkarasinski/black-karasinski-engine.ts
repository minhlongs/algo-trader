import { BkTrinomialTree } from './black-karasinski-tree';
import {
  BkCalibrationConfig,
  BkCalibrationResult,
  BkModelParameters,
  BkOptionResult,
  BkOptionSpec,
  BkYieldPoint,
} from './black-karasinski-types';
import {
  interpolateTargetDiscountFactor,
  solveAlphaNewtonRaphson,
  stepStatePricesForward,
  rollbackTrinomialValues,
} from './black-karasinski-math';

export {
  interpolateTargetDiscountFactor,
  solveAlphaNewtonRaphson,
  stepStatePricesForward,
  rollbackTrinomialValues,
};

export class BlackKarasinskiEngine {
  public calibrate(
    yieldCurve: BkYieldPoint[],
    params: BkModelParameters,
    config: BkCalibrationConfig
  ): BkCalibrationResult {
    const { meanReversionSpeed: a, shortRateVolatility: sigma } = params;
    const { steps, timeHorizonYears } = config;

    if (steps <= 0 || steps > 50) throw new Error('Steps must be between 1 and 50');
    if (timeHorizonYears <= 0) throw new Error('Time horizon must be positive');
    if (a < 0 || sigma <= 0) throw new Error('Mean reversion speed must be >= 0 and sigma > 0');
    if (yieldCurve.length === 0) throw new Error('Yield curve must not be empty');

    const dt = timeHorizonYears / steps;
    const dx = BkTrinomialTree.calculateDx(sigma, dt);
    const sortedCurve = [...yieldCurve].sort((p1, p2) => p1.maturityYears - p2.maturityYears);

    const alphas: number[] = [];
    const targetDFs: number[] = [];
    const fittedDFs: number[] = [];

    let currentQ = new Map<number, number>();
    currentQ.set(0, 1.0);

    for (let i = 0; i < steps; i++) {
      const tNext = (i + 1) * dt;
      const targetDF = interpolateTargetDiscountFactor(sortedCurve, tNext);
      targetDFs.push(Number(targetDF.toFixed(6)));

      const { alpha, fittedDF } = solveAlphaNewtonRaphson(currentQ, targetDF, tNext, dx, dt);
      alphas.push(Number(alpha.toFixed(6)));
      fittedDFs.push(Number(fittedDF.toFixed(6)));

      currentQ = stepStatePricesForward(currentQ, alpha, dx, dt, a);
    }

    return { steps, dt, dx, alphas, targetDiscountFactors: targetDFs, fittedDiscountFactors: fittedDFs };
  }

  public priceOption(
    calib: BkCalibrationResult,
    params: BkModelParameters,
    spec: BkOptionSpec
  ): BkOptionResult {
    const { optionExpiryYears: tOpt, bondMaturityYears: tBond, strikePrice: K, isCall, faceValue = 100 } = spec;
    if (tOpt <= 0 || tBond <= tOpt) throw new Error('Expiry must be positive and bond maturity > option expiry');
    if (K <= 0) throw new Error('Strike must be positive');

    const { dt, dx, alphas } = calib;
    const { meanReversionSpeed: a } = params;
    const optStep = Math.round(tOpt / dt);
    const bondStep = Math.round(tBond / dt);

    if (bondStep > calib.steps) throw new Error('Bond maturity exceeds calibrated tree horizon');

    let bondValues = new Map<number, number>();
    const maxJ = bondStep * 2;
    for (let j = -maxJ; j <= maxJ; j++) {
      bondValues.set(j, faceValue);
    }

    bondValues = rollbackTrinomialValues(bondValues, alphas, bondStep, optStep, dx, dt, a, faceValue);

    let optValues = new Map<number, number>();
    for (const [j, bondP] of bondValues.entries()) {
      const payoff = isCall ? Math.max(0, bondP - K) : Math.max(0, K - bondP);
      optValues.set(j, payoff);
    }

    optValues = rollbackTrinomialValues(optValues, alphas, optStep, 0, dx, dt, a, 0);

    const price = optValues.get(0) || 0.0;
    const underlyingBondP = bondValues.get(0) || 0.0;
    const intrinsic = isCall ? Math.max(0, underlyingBondP - K) : Math.max(0, K - underlyingBondP);

    return {
      optionPrice: Number(price.toFixed(4)),
      underlyingBondPrice: Number(underlyingBondP.toFixed(4)),
      intrinsicValue: Number(intrinsic.toFixed(4)),
      isCall,
    };
  }
}
