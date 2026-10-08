import { BkTrinomialTree } from './black-karasinski-tree';
import {
  BkCalibrationConfig,
  BkCalibrationResult,
  BkModelParameters,
  BkOptionResult,
  BkOptionSpec,
  BkYieldPoint,
} from './black-karasinski-types';

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

    const getTargetDF = (t: number): number => {
      if (t <= sortedCurve[0]!.maturityYears) return sortedCurve[0]!.discountFactor;
      for (let i = 0; i < sortedCurve.length - 1; i++) {
        const p1 = sortedCurve[i]!;
        const p2 = sortedCurve[i + 1]!;
        if (t >= p1.maturityYears && t <= p2.maturityYears) {
          const w = (t - p1.maturityYears) / (p2.maturityYears - p1.maturityYears);
          return Math.exp(Math.log(p1.discountFactor) * (1 - w) + Math.log(p2.discountFactor) * w);
        }
      }
      return sortedCurve[sortedCurve.length - 1]!.discountFactor;
    };

    const alphas: number[] = [];
    const targetDFs: number[] = [];
    const fittedDFs: number[] = [];

    // State prices Q[i][j]: map j index to Arrow-Debreu state price
    let currentQ = new Map<number, number>();
    currentQ.set(0, 1.0);

    for (let i = 0; i < steps; i++) {
      const tNext = (i + 1) * dt;
      const targetDF = getTargetDF(tNext);
      targetDFs.push(Number(targetDF.toFixed(6)));

      // Solve for alpha_i such that sum_j Q(i, j) * exp(-exp(alpha_i + j*dx) * dt) = targetDF
      let alpha = Math.log(Math.max(1e-4, -Math.log(targetDF) / tNext)); // Initial guess
      for (let iter = 0; iter < 40; iter++) {
        let fVal = -targetDF;
        let fDeriv = 0.0;
        for (const [j, qVal] of currentQ.entries()) {
          const rate = Math.exp(alpha + j * dx);
          const disc = Math.exp(-rate * dt);
          fVal += qVal * disc;
          fDeriv -= qVal * disc * rate * dt;
        }
        if (Math.abs(fDeriv) < 1e-12) break;
        const delta = fVal / fDeriv;
        alpha -= delta;
        if (Math.abs(delta) < 1e-8) break;
      }

      alphas.push(Number(alpha.toFixed(6)));

      let fittedDF = 0.0;
      for (const [j, qVal] of currentQ.entries()) {
        const rate = Math.exp(alpha + j * dx);
        fittedDF += qVal * Math.exp(-rate * dt);
      }
      fittedDFs.push(Number(fittedDF.toFixed(6)));

      // Forward step: update state prices to Q[i+1]
      const nextQ = new Map<number, number>();
      for (const [j, qVal] of currentQ.entries()) {
        const rate = Math.exp(alpha + j * dx);
        const disc = Math.exp(-rate * dt);
        const { k, pu, pm, pd } = BkTrinomialTree.getBranchingProbabilities(j, a, dt);

        const jUp = j + k + 1;
        const jMid = j + k;
        const jDown = j + k - 1;

        nextQ.set(jUp, (nextQ.get(jUp) || 0) + qVal * disc * pu);
        nextQ.set(jMid, (nextQ.get(jMid) || 0) + qVal * disc * pm);
        nextQ.set(jDown, (nextQ.get(jDown) || 0) + qVal * disc * pd);
      }
      currentQ = nextQ;
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

    // Rollback bond payoff from bondStep to optStep
    // Bond payoff at bondStep is faceValue
    let bondValues = new Map<number, number>();
    const maxJ = bondStep * 2;
    for (let j = -maxJ; j <= maxJ; j++) {
      bondValues.set(j, faceValue);
    }

    for (let i = bondStep - 1; i >= optStep; i--) {
      const alpha_i = alphas[i]!;
      const prevBondValues = new Map<number, number>();
      const stepJ = i * 2;
      for (let j = -stepJ; j <= stepJ; j++) {
        const rate = Math.exp(alpha_i + j * dx);
        const disc = Math.exp(-rate * dt);
        const { k, pu, pm, pd } = BkTrinomialTree.getBranchingProbabilities(j, a, dt);

        const valUp = bondValues.get(j + k + 1) || faceValue;
        const valMid = bondValues.get(j + k) || faceValue;
        const valDown = bondValues.get(j + k - 1) || faceValue;

        const expectedVal = pu * valUp + pm * valMid + pd * valDown;
        prevBondValues.set(j, expectedVal * disc);
      }
      bondValues = prevBondValues;
    }

    // Option payoff at optStep
    let optValues = new Map<number, number>();
    for (const [j, bondP] of bondValues.entries()) {
      const payoff = isCall ? Math.max(0, bondP - K) : Math.max(0, K - bondP);
      optValues.set(j, payoff);
    }

    // Rollback option values from optStep down to 0
    for (let i = optStep - 1; i >= 0; i--) {
      const alpha_i = alphas[i]!;
      const prevOptValues = new Map<number, number>();
      const stepJ = i * 2;
      for (let j = -stepJ; j <= stepJ; j++) {
        const rate = Math.exp(alpha_i + j * dx);
        const disc = Math.exp(-rate * dt);
        const { k, pu, pm, pd } = BkTrinomialTree.getBranchingProbabilities(j, a, dt);

        const vUp = optValues.get(j + k + 1) || 0;
        const vMid = optValues.get(j + k) || 0;
        const vDown = optValues.get(j + k - 1) || 0;

        const expVal = pu * vUp + pm * vMid + pd * vDown;
        prevOptValues.set(j, expVal * disc);
      }
      optValues = prevOptValues;
    }

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
