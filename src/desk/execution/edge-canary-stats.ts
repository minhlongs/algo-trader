/**
 * Edge Canary Deployment Statistics & Kolmogorov-Smirnov Test
 *
 * Provides distribution comparison and percentiles for canary verification.
 */

export interface KsTestResult {
  statistic: number;
  criticalValue: number;
  driftDetected: boolean;
  alpha: number;
}

export function computePercentile(data: readonly number[], p: number): number {
  if (data.length === 0) return 0;
  const sorted = [...data].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, idx))]!;
}

export function computeMean(data: readonly number[]): number {
  if (data.length === 0) return 0;
  return data.reduce((sum, v) => sum + v, 0) / data.length;
}

/**
 * Two-Sample Kolmogorov-Smirnov Test
 * Computes supremum distance between empirical CDFs of baseline and canary.
 */
export function kolmogorovSmirnov2Sample(
  baseline: readonly number[],
  canary: readonly number[],
  alpha = 0.05,
): KsTestResult {
  const n1 = baseline.length;
  const n2 = canary.length;

  if (n1 === 0 || n2 === 0) {
    return { statistic: 0, criticalValue: 1, driftDetected: false, alpha };
  }

  const s1 = [...baseline].sort((a, b) => a - b);
  const s2 = [...canary].sort((a, b) => a - b);

  let i1 = 0;
  let i2 = 0;
  let dMax = 0;

  while (i1 < n1 || i2 < n2) {
    let val: number;
    if (i1 < n1 && i2 < n2) {
      val = Math.min(s1[i1]!, s2[i2]!);
    } else if (i1 < n1) {
      val = s1[i1]!;
    } else {
      val = s2[i2]!;
    }

    while (i1 < n1 && s1[i1]! <= val) i1++;
    while (i2 < n2 && s2[i2]! <= val) i2++;

    const cdf1 = i1 / n1;
    const cdf2 = i2 / n2;
    const diff = Math.abs(cdf1 - cdf2);
    if (diff > dMax) dMax = diff;
  }

  const cAlpha = alpha <= 0.01 ? 1.628 : alpha <= 0.05 ? 1.358 : 1.224;
  const criticalValue = cAlpha * Math.sqrt((n1 + n2) / (n1 * n2));

  return {
    statistic: dMax,
    criticalValue,
    driftDetected: dMax > criticalValue,
    alpha,
  };
}
