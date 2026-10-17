/**
 * Wave 263: López de Prado (2018) Fractionally Differentiated Features.
 * Generates binomial expansion weights and applies rolling window convolution.
 * Strictly < 85 LOC, zero :any.
 */

import { FracDiffConfig, FracDiffResult, FracDiffWeightProfile } from './types';

export function getFracDiffWeights(d: number, threshold = 1e-4, maxLag = 2000): FracDiffWeightProfile {
  if (d <= 0 || d >= 1) throw new Error('Fractional degree d must be strictly in (0, 1)');

  const weights: number[] = [1.0];
  let k = 1;
  let wCurr = 1.0;

  while (k < maxLag) {
    wCurr = -wCurr * ((d - k + 1) / k);
    if (Math.abs(wCurr) < threshold) break;
    weights.push(wCurr);
    k++;
  }

  const sumWeights = weights.reduce((acc, val) => acc + val, 0);
  return { d, weights, numWeights: weights.length, sumWeights };
}

export function computeFractionalDifferentiation(series: readonly number[], cfg: FracDiffConfig): FracDiffResult {
  if (series.length === 0) throw new Error('Series must not be empty');

  const profile = getFracDiffWeights(cfg.d, cfg.threshold ?? 1e-4, cfg.maxLag ?? 2000);
  const w = profile.weights;
  const K = w.length;
  const diffSeries: number[] = [];

  for (let t = 0; t < series.length; t++) {
    if (t < K - 1) {
      diffSeries.push(NaN); // warmup window before full history available
    } else {
      let val = 0;
      for (let k = 0; k < K; k++) {
        val += w[k] * series[t - k];
      }
      diffSeries.push(val);
    }
  }

  // Calculate Pearson correlation on valid portion to measure memory retention
  const validOrig: number[] = [];
  const validDiff: number[] = [];
  for (let i = K - 1; i < series.length; i++) {
    validOrig.push(series[i]);
    validDiff.push(diffSeries[i]);
  }

  let memoryCorr = 0;
  if (validOrig.length > 1) {
    const meanO = validOrig.reduce((a, b) => a + b, 0) / validOrig.length;
    const meanD = validDiff.reduce((a, b) => a + b, 0) / validDiff.length;
    let cov = 0, varO = 0, varD = 0;
    for (let i = 0; i < validOrig.length; i++) {
      const dO = validOrig[i] - meanO;
      const dD = validDiff[i] - meanD;
      cov += dO * dD;
      varO += dO * dO;
      varD += dD * dD;
    }
    const denom = Math.sqrt(varO * varD);
    memoryCorr = denom > 1e-9 ? cov / denom : 0;
  }

  return {
    differentiatedSeries: diffSeries,
    originalLength: series.length,
    validLength: validOrig.length,
    memoryRetentionCorrelation: memoryCorr,
    weightProfile: profile,
  };
}
