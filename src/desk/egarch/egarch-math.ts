/**
 * Mathematical formulations for Nelson (1991) EGARCH model.
 * Strictly < 180 LOC, zero :any types.
 */

import {
  EgarchForecastPoint,
  EgarchParams,
  EgarchPoint,
} from './egarch-types';

export const SQRT_TWO_OVER_PI = 0.7978845608028654; // E[|z|] for standard normal

export function computeSampleVariance(returns: readonly number[]): number {
  if (returns.length === 0) return 1e-4;
  let sum = 0;
  for (const r of returns) sum += r;
  const mean = sum / returns.length;
  let ssq = 0;
  for (const r of returns) {
    const diff = r - mean;
    ssq += diff * diff;
  }
  return Math.max(ssq / Math.max(1, returns.length - 1), 1e-6);
}

export function evaluateEgarchSeries(
  returns: readonly number[],
  params: EgarchParams,
  initLogVar?: number
): readonly EgarchPoint[] {
  const n = returns.length;
  if (n === 0) return [];

  const sampleVar = computeSampleVariance(returns);
  const baseLogVar = initLogVar ?? Math.log(sampleVar);
  const points: EgarchPoint[] = [];

  let currentLogVar = baseLogVar;

  for (let t = 0; t < n; t++) {
    const currentVar = Math.max(Math.exp(currentLogVar), 1e-9);
    const currentVol = Math.sqrt(currentVar);
    const ret = returns[t];
    const z = ret / currentVol;

    points.push({
      t,
      returnVal: ret,
      condLogVar: currentLogVar,
      condVariance: currentVar,
      condVol: currentVol,
      standardizedResidual: z,
    });

    // Nelson (1991) recurrence: ln(sigma_{t+1}^2) = omega + beta * ln(sigma_t^2) + alpha * (|z_t| - sqrt(2/pi)) + gamma * z_t
    const gZ = params.alpha * (Math.abs(z) - SQRT_TWO_OVER_PI) + params.gamma * z;
    currentLogVar = params.omega + params.beta * currentLogVar + gZ;
    // Bound log variance to prevent numerical overflow
    currentLogVar = Math.max(-20, Math.min(20, currentLogVar));
  }

  return points;
}

export function computeEgarchLogLikelihood(
  points: readonly EgarchPoint[]
): number {
  if (points.length === 0) return -Infinity;
  const ln2Pi = Math.log(2 * Math.PI);
  let totalLl = 0;

  for (const pt of points) {
    const eps2 = pt.returnVal * pt.returnVal;
    // -0.5 * (ln(2*pi) + ln(sigma^2) + eps^2 / sigma^2)
    const ll_t = -0.5 * (ln2Pi + pt.condLogVar + eps2 / pt.condVariance);
    if (!Number.isFinite(ll_t)) return -1e12;
    totalLl += ll_t;
  }

  return totalLl;
}

export function computeUnconditionalEgarchVariance(
  params: EgarchParams
): number {
  if (Math.abs(params.beta) >= 0.9999) {
    return Math.exp(params.omega / 0.0001);
  }
  const unconditionalLogVar = params.omega / (1.0 - params.beta);
  return Math.exp(Math.max(-20, Math.min(20, unconditionalLogVar)));
}

export function forecastEgarchPath(
  lastLogVar: number,
  params: EgarchParams,
  horizon: number
): readonly EgarchForecastPoint[] {
  const forecasts: EgarchForecastPoint[] = [];
  let currentLogVar = lastLogVar;

  for (let h = 1; h <= horizon; h++) {
    // Under conditional expectation: E[|z| - sqrt(2/pi)] = 0 and E[z] = 0
    // Hence E[ln(sigma_{t+h}^2)] = omega + beta * ln(sigma_{t+h-1}^2)
    currentLogVar = params.omega + params.beta * currentLogVar;
    currentLogVar = Math.max(-20, Math.min(20, currentLogVar));
    const condVar = Math.exp(currentLogVar);
    forecasts.push({
      step: h,
      condLogVar: currentLogVar,
      condVariance: condVar,
      condVol: Math.sqrt(condVar),
    });
  }

  return forecasts;
}
