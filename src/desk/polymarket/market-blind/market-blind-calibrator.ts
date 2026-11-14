/**
 * Market-Blind Calibration & Out-of-Sample Skill Metrics (IC Report Strategy 6).
 *
 * Implements Pool-Adjacent-Violators (PAVA) Isotonic Regression, Logit/Beta
 * calibration (`logit(p_cal) = a * logit(p_raw) + b` clamped to [1e-4, 1-1e-4]),
 * Out-of-Sample Brier Score & BSS_OOS with 95% lower confidence bound, 10-bin
 * Expected Calibration Error (ECE), and rolling 100-market Brier comparison.
 */

import {
  MarketBlindError,
  type CalibrationMetrics,
  type CalibrationSample,
  type IsotonicBlock,
  type IsotonicCalibratorModel,
  type LogitCalibratorModel,
  type OosEvaluationRecord,
} from './market-blind-types';

export const PROB_EPS = 1e-4;
const Z_95_ONE_SIDED = 1.645;

/** Clamps a finite probability safely inside `[1e-4, 1 - 1e-4]`. */
export function clampProb(p: number, eps = PROB_EPS): number {
  if (!Number.isFinite(p)) {
    throw new MarketBlindError('INVALID_MARKET_BLIND_INPUT', `Probability must be finite; got ${p}`);
  }
  return Math.min(1 - eps, Math.max(eps, p));
}

export function logit(p: number): number {
  const c = clampProb(p);
  return Math.log(c / (1 - c));
}

function sigmoidUnclamped(z: number): number {
  return z >= 0 ? 1 / (1 + Math.exp(-z)) : Math.exp(z) / (1 + Math.exp(z));
}

export function sigmoid(z: number): number {
  if (!Number.isFinite(z)) {
    throw new MarketBlindError('INVALID_MARKET_BLIND_INPUT', `Log-odds must be finite; got ${z}`);
  }
  return clampProb(sigmoidUnclamped(z));
}

function validateSamples(samples: readonly CalibrationSample[]): void {
  if (samples.length === 0) {
    throw new MarketBlindError('INVALID_MARKET_BLIND_INPUT', 'Calibration requires at least one sample');
  }
  for (const s of samples) {
    if (!Number.isFinite(s.pRaw) || s.pRaw < 0 || s.pRaw > 1 || (s.outcome !== 0 && s.outcome !== 1)) {
      throw new MarketBlindError('INVALID_MARKET_BLIND_INPUT', 'Invalid calibration sample');
    }
  }
}

/** Pool-Adjacent-Violators (PAVA) monotonic non-decreasing isotonic regression. */
export function fitIsotonicCalibrator(samples: readonly CalibrationSample[]): IsotonicCalibratorModel {
  validateSamples(samples);
  const sorted = [...samples].map((s) => ({ x: clampProb(s.pRaw), y: s.outcome })).sort((a, b) => a.x - b.x);
  const grouped: Array<{ minX: number; maxX: number; weight: number; sumY: number }> = [];
  for (const pt of sorted) {
    const last = grouped[grouped.length - 1];
    if (last && last.maxX === pt.x) {
      last.weight += 1; last.sumY += pt.y;
    } else {
      grouped.push({ minX: pt.x, maxX: pt.x, weight: 1, sumY: pt.y });
    }
  }
  const stack: Array<{ minX: number; maxX: number; weight: number; sumY: number }> = [];
  for (const block of grouped) {
    stack.push({ ...block });
    while (stack.length >= 2) {
      const curr = stack[stack.length - 1]!;
      const prev = stack[stack.length - 2]!;
      if (prev.sumY / prev.weight <= curr.sumY / curr.weight) break;
      prev.maxX = curr.maxX; prev.weight += curr.weight; prev.sumY += curr.sumY;
      stack.pop();
    }
  }
  const blocks: IsotonicBlock[] = stack.map((b) =>
    Object.freeze({ minX: b.minX, maxX: b.maxX, weight: b.weight, meanOutcome: b.sumY / b.weight }),
  );
  return Object.freeze({ kind: 'isotonic-pava', sampleCount: samples.length, blocks: Object.freeze(blocks) });
}

/** Evaluates a fitted PAVA isotonic model with linear interpolation between blocks. */
export function predictIsotonic(model: IsotonicCalibratorModel, pRaw: number): number {
  const x = clampProb(pRaw);
  const { blocks } = model;
  if (blocks.length === 0) return x;
  if (x <= blocks[0]!.maxX) return clampProb(blocks[0]!.meanOutcome);
  const last = blocks[blocks.length - 1]!;
  if (x >= last.minX) return clampProb(last.meanOutcome);
  for (let i = 0; i < blocks.length; i += 1) {
    const b = blocks[i]!;
    if (x >= b.minX && x <= b.maxX) return clampProb(b.meanOutcome);
    const next = blocks[i + 1];
    if (next && x > b.maxX && x < next.minX) {
      return clampProb(b.meanOutcome + ((x - b.maxX) / (next.minX - b.maxX)) * (next.meanOutcome - b.meanOutcome));
    }
  }
  return clampProb(last.meanOutcome);
}

/** Applies `logit(p_cal) = slope * logit(p_raw) + intercept`, clamped inside `[1e-4, 1-1e-4]`. */
export function calibrateLogitLinear(pRaw: number, slope: number, intercept: number): number {
  if (!Number.isFinite(slope) || !Number.isFinite(intercept)) {
    throw new MarketBlindError('INVALID_MARKET_BLIND_INPUT', 'Logit calibration parameters must be finite');
  }
  return sigmoid(slope * logit(pRaw) + intercept);
}

/** Fits `logit(p_cal) = a * logit(p_raw) + b` via damped Newton-Raphson with weak identity prior. */
export function fitLogitCalibrator(samples: readonly CalibrationSample[], l2Lambda = 1e-3): LogitCalibratorModel {
  validateSamples(samples);
  const zList = samples.map((s) => logit(s.pRaw));
  let slope = 1;
  let intercept = 0;
  for (let iter = 0; iter < 30; iter += 1) {
    let gA = l2Lambda * (slope - 1); let gB = l2Lambda * intercept;
    let hAA = l2Lambda; let hAB = 0; let hBB = l2Lambda;
    for (let i = 0; i < samples.length; i += 1) {
      const z = zList[i]!;
      const p = sigmoidUnclamped(slope * z + intercept);
      const w = Math.max(1e-9, p * (1 - p));
      const diff = p - samples[i]!.outcome;
      gA += diff * z; gB += diff; hAA += w * z * z; hAB += w * z; hBB += w;
    }
    const det = hAA * hBB - hAB * hAB;
    if (det <= 1e-15) break;
    const dA = (hBB * gA - hAB * gB) / det;
    const dB = (hAA * gB - hAB * gA) / det;
    const step = Math.min(1, 2 / Math.max(Math.abs(dA), Math.abs(dB), 1e-9));
    slope = Math.max(0, slope - step * dA);
    intercept -= step * dB;
    if (Math.abs(dA) + Math.abs(dB) < 1e-9) break;
  }
  return Object.freeze({ kind: 'logit-platt', sampleCount: samples.length, slope, intercept });
}

export function predictLogitCalibrated(model: LogitCalibratorModel, pRaw: number): number {
  return calibrateLogitLinear(pRaw, model.slope, model.intercept);
}

/** Expected Calibration Error (ECE) across 10 equal-width probability bins on [0, 1]. */
export function computeExpectedCalibrationError(
  records: ReadonlyArray<{ pCal: number; outcome: 0 | 1 }>,
  binCount = 10,
): number {
  if (records.length === 0) return 1;
  const counts = new Array<number>(binCount).fill(0);
  const sumPred = new Array<number>(binCount).fill(0);
  const sumOut = new Array<number>(binCount).fill(0);
  for (const r of records) {
    const p = clampProb(r.pCal);
    const idx = Math.min(binCount - 1, Math.floor(p * binCount));
    counts[idx]! += 1; sumPred[idx]! += p; sumOut[idx]! += r.outcome;
  }
  return counts.reduce((acc, c, b) => (c > 0 ? acc + Math.abs(sumPred[b]! - sumOut[b]!) / records.length : acc), 0);
}

/** Computes OOS Brier, BSS_OOS, 95% lower bound, 10-bin ECE, and rolling 100-market Brier. */
export function evaluateCalibrationMetrics(records: readonly OosEvaluationRecord[]): CalibrationMetrics {
  const n = records.length;
  if (n === 0) {
    return {
      resolvedCount: 0, bsModel: 1, bsMarket: 0, bssOos: Number.NEGATIVE_INFINITY,
      bssLower95: Number.NEGATIVE_INFINITY, ece: 1, rolling100ModelBrier: 1, rolling100MarketBrier: 0,
    };
  }
  const sErr: number[] = [];
  const mErr: number[] = [];
  for (const r of records) {
    if (!Number.isFinite(r.pCal) || r.pCal < 0 || r.pCal > 1 ||
        !Number.isFinite(r.pMarket) || r.pMarket < 0 || r.pMarket > 1 || (r.outcome !== 0 && r.outcome !== 1)) {
      throw new MarketBlindError('INVALID_MARKET_BLIND_INPUT', 'Invalid OOS evaluation record');
    }
    sErr.push((r.pCal - r.outcome) ** 2);
    mErr.push((r.pMarket - r.outcome) ** 2);
  }
  const bsModel = sErr.reduce((a, b) => a + b, 0) / n;
  const bsMarket = mErr.reduce((a, b) => a + b, 0) / n;
  const bssOos = bsMarket > 0 ? 1 - bsModel / bsMarket : Number.NEGATIVE_INFINITY;
  const sumU2 = n >= 2 && bsMarket > 0 && Number.isFinite(bssOos)
    ? sErr.reduce((acc, s, i) => acc + ((1 - bssOos) * mErr[i]! - s) ** 2, 0)
    : Number.POSITIVE_INFINITY;
  const bssLower95 = Number.isFinite(sumU2)
    ? bssOos - Z_95_ONE_SIDED * Math.sqrt(sumU2 / (n * (n - 1) * bsMarket * bsMarket))
    : Number.NEGATIVE_INFINITY;
  const tail = Math.max(0, n - 100);
  const tailLen = n - tail;
  return {
    resolvedCount: n, bsModel, bsMarket, bssOos, bssLower95,
    ece: computeExpectedCalibrationError(records, 10),
    rolling100ModelBrier: sErr.slice(tail).reduce((a, b) => a + b, 0) / tailLen,
    rolling100MarketBrier: mErr.slice(tail).reduce((a, b) => a + b, 0) / tailLen,
  };
}
