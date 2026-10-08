import {
  BdtBondOptionSpec,
  BdtCalibrationResult,
  BdtOptionResult,
  BdtYieldPoint,
} from './bdt-types';

export class BdtEngine {
  public calibrateTree(
    yieldCurve: BdtYieldPoint[],
    steps: number,
    timeHorizonYears: number
  ): BdtCalibrationResult {
    if (steps <= 0 || steps > 100) throw new Error('Steps must be between 1 and 100');
    if (timeHorizonYears <= 0) throw new Error('Time horizon must be positive');
    if (yieldCurve.length === 0) throw new Error('Yield curve must not be empty');

    const dt = timeHorizonYears / steps;
    const sortedCurve = [...yieldCurve].sort((a, b) => a.maturityYears - b.maturityYears);

    const getYieldTarget = (t: number): { df: number; vol: number } => {
      if (t <= sortedCurve[0]!.maturityYears) {
        return { df: sortedCurve[0]!.discountFactor, vol: sortedCurve[0]!.rateVolatility };
      }
      for (let i = 0; i < sortedCurve.length - 1; i++) {
        const p1 = sortedCurve[i]!;
        const p2 = sortedCurve[i + 1]!;
        if (t >= p1.maturityYears && t <= p2.maturityYears) {
          const w = (t - p1.maturityYears) / (p2.maturityYears - p1.maturityYears);
          const df = Math.exp(Math.log(p1.discountFactor) * (1 - w) + Math.log(p2.discountFactor) * w);
          const vol = p1.rateVolatility * (1 - w) + p2.rateVolatility * w;
          return { df, vol };
        }
      }
      const last = sortedCurve[sortedCurve.length - 1]!;
      return { df: last.discountFactor, vol: last.rateVolatility };
    };

    const uRates: number[] = [];
    const sigmas: number[] = [];
    const targetDFs: number[] = [];
    const fittedDFs: number[] = [];

    // State prices Q(i, j)
    let qPrev = [1.0];

    for (let i = 0; i < steps; i++) {
      const tNext = (i + 1) * dt;
      const { df: targetDF, vol: sigma } = getYieldTarget(tNext);
      targetDFs.push(Number(targetDF.toFixed(6)));
      sigmas.push(Number(sigma.toFixed(6)));

      const k = Math.exp(2.0 * sigma * Math.sqrt(dt));

      // Solve for u_i such that sum_j Q(i, j) * exp(-u_i * k^j * dt) = targetDF
      let u = 0.04; // Initial guess 4%
      for (let iter = 0; iter < 50; iter++) {
        let fVal = -targetDF;
        let fDeriv = 0.0;
        for (let j = 0; j <= i; j++) {
          const rate_ij = u * Math.pow(k, j);
          const discount = Math.exp(-rate_ij * dt);
          fVal += qPrev[j]! * discount;
          fDeriv += -qPrev[j]! * Math.pow(k, j) * dt * discount;
        }
        if (Math.abs(fVal) < 1e-9) break;
        if (Math.abs(fDeriv) > 1e-12) {
          u = Math.max(1e-5, u - fVal / fDeriv);
        }
      }
      uRates.push(Number(u.toFixed(6)));

      // Compute fitted DF
      let stepFitted = 0.0;
      for (let j = 0; j <= i; j++) {
        stepFitted += qPrev[j]! * Math.exp(-u * Math.pow(k, j) * dt);
      }
      fittedDFs.push(Number(stepFitted.toFixed(6)));

      // Update Q for next step i + 1
      const qNext = new Array<number>(i + 2).fill(0.0);
      for (let j = 0; j <= i; j++) {
        const rate_ij = u * Math.pow(k, j);
        const transWeight = 0.5 * qPrev[j]! * Math.exp(-rate_ij * dt);
        qNext[j] = (qNext[j] ?? 0.0) + transWeight;
        qNext[j + 1] = (qNext[j + 1] ?? 0.0) + transWeight;
      }
      qPrev = qNext;
    }

    return {
      steps,
      dt: Number(dt.toFixed(6)),
      baselineRates: uRates,
      volatilities: sigmas,
      discountFactorsTarget: targetDFs,
      discountFactorsFitted: fittedDFs,
    };
  }

  public priceBondOption(
    calib: BdtCalibrationResult,
    spec: BdtBondOptionSpec
  ): BdtOptionResult {
    const { dt, baselineRates, volatilities } = calib;
    const faceValue = spec.faceValueUsd ?? 100.0;
    const expiryStep = Math.max(1, Math.round(spec.optionExpiryYears / dt));
    const bondMatStep = Math.max(expiryStep, Math.round(spec.bondMaturityYears / dt));

    if (expiryStep > calib.steps || bondMatStep > calib.steps) {
      throw new Error('Option or bond maturity exceeds calibrated tree horizon');
    }

    // 1. Roll back bond from bondMatStep to 0
    let bondValues = new Array<number>(bondMatStep + 1).fill(faceValue);
    const bondSliceAtExpiry: number[] = [];

    for (let i = bondMatStep - 1; i >= 0; i--) {
      const u = baselineRates[i]!;
      const sigma = volatilities[i]!;
      const k = Math.exp(2.0 * sigma * Math.sqrt(dt));
      const nextBond = new Array<number>(i + 1);

      for (let j = 0; j <= i; j++) {
        const rate_ij = u * Math.pow(k, j);
        const discount = Math.exp(-rate_ij * dt);
        nextBond[j] = 0.5 * discount * (bondValues[j]! + bondValues[j + 1]!);
      }
      bondValues = nextBond;
      if (i === expiryStep) {
        bondSliceAtExpiry.push(...bondValues);
      }
    }
    const underlyingBondPrice = bondValues[0]!;

    // 2. Roll back option from expiryStep to 0
    let optionValues = new Array<number>(expiryStep + 1);
    for (let j = 0; j <= expiryStep; j++) {
      const bPrice = bondSliceAtExpiry[j]!;
      const payoff = spec.isCall
        ? Math.max(0, bPrice - spec.strikePriceUsd)
        : Math.max(0, spec.strikePriceUsd - bPrice);
      optionValues[j] = payoff;
    }

    for (let i = expiryStep - 1; i >= 0; i--) {
      const u = baselineRates[i]!;
      const sigma = volatilities[i]!;
      const k = Math.exp(2.0 * sigma * Math.sqrt(dt));
      const nextOpt = new Array<number>(i + 1);

      for (let j = 0; j <= i; j++) {
        const rate_ij = u * Math.pow(k, j);
        const discount = Math.exp(-rate_ij * dt);
        const contVal = 0.5 * discount * (optionValues[j]! + optionValues[j + 1]!);
        nextOpt[j] = contVal;
      }
      optionValues = nextOpt;
    }

    const optionPrice = optionValues[0]!;
    const intrinsicValue = spec.isCall
      ? Math.max(0, underlyingBondPrice - spec.strikePriceUsd)
      : Math.max(0, spec.strikePriceUsd - underlyingBondPrice);

    return {
      optionPriceUsd: Number(optionPrice.toFixed(4)),
      underlyingBondPriceUsd: Number(underlyingBondPrice.toFixed(4)),
      forwardBondPriceUsd: Number((underlyingBondPrice / calib.discountFactorsFitted[expiryStep - 1]!).toFixed(4)),
      intrinsicValueUsd: Number(intrinsicValue.toFixed(4)),
    };
  }
}
