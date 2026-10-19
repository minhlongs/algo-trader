/**
 * Black-Karasinski Short-Rate & Trinomial Tree Math Helpers
 * Extracted from black-karasinski-engine.ts for pure discount factor interpolation,
 * Newton-Raphson alpha calibration, forward state-price propagation, and backward induction.
 */

import { BkTrinomialTree } from './black-karasinski-tree';
import type { BkYieldPoint } from './black-karasinski-types';

export function interpolateTargetDiscountFactor(
  sortedCurve: BkYieldPoint[],
  t: number,
): number {
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
}

export function solveAlphaNewtonRaphson(
  currentQ: Map<number, number>,
  targetDF: number,
  tNext: number,
  dx: number,
  dt: number,
): { alpha: number; fittedDF: number } {
  let alpha = Math.log(Math.max(1e-4, -Math.log(targetDF) / tNext));
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

  let fittedDF = 0.0;
  for (const [j, qVal] of currentQ.entries()) {
    const rate = Math.exp(alpha + j * dx);
    fittedDF += qVal * Math.exp(-rate * dt);
  }
  return { alpha, fittedDF };
}

export function stepStatePricesForward(
  currentQ: Map<number, number>,
  alpha: number,
  dx: number,
  dt: number,
  a: number,
): Map<number, number> {
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
  return nextQ;
}

export function rollbackTrinomialValues(
  initialValues: Map<number, number>,
  alphas: number[],
  fromStep: number,
  toStep: number,
  dx: number,
  dt: number,
  a: number,
  fallbackValue: number,
): Map<number, number> {
  let values = initialValues;
  for (let i = fromStep - 1; i >= toStep; i--) {
    const alpha_i = alphas[i]!;
    const prevValues = new Map<number, number>();
    const stepJ = i * 2;
    for (let j = -stepJ; j <= stepJ; j++) {
      const rate = Math.exp(alpha_i + j * dx);
      const disc = Math.exp(-rate * dt);
      const { k, pu, pm, pd } = BkTrinomialTree.getBranchingProbabilities(j, a, dt);

      const valUp = values.get(j + k + 1) ?? fallbackValue;
      const valMid = values.get(j + k) ?? fallbackValue;
      const valDown = values.get(j + k - 1) ?? fallbackValue;

      const expectedVal = pu * valUp + pm * valMid + pd * valDown;
      prevValues.set(j, expectedVal * disc);
    }
    values = prevValues;
  }
  return values;
}
