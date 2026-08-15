/**
 * A/B Test Statistics — two-proportion z-test and recommendation builder.
 * Used by ab-test-manager.ts for significance computation.
 */

import type { GroupStats, GroupName } from './ab-test-manager';

/**
 * Two-proportion z-test for comparing accuracy rates.
 * Returns p-value and whether result exceeds significance threshold.
 */
export function computeSignificance(
  control: GroupStats,
  treatment: GroupStats,
  confidenceLevel: number,
): { pValue: number; significant: boolean } {
  if (control.total < 2 || treatment.total < 2) {
    return { pValue: 1, significant: false };
  }
  const p1 = control.accuracy;
  const p2 = treatment.accuracy;
  const n1 = control.total;
  const n2 = treatment.total;
  const pPool = (control.correct + treatment.correct) / (n1 + n2);
  if (pPool === 0 || pPool === 1) return { pValue: 1, significant: false };

  const se = Math.sqrt(pPool * (1 - pPool) * (1 / n1 + 1 / n2));
  const z = (p2 - p1) / se;
  const pValue = 2 * (1 - normalCDF(Math.abs(z)));
  return { pValue, significant: pValue < (1 - confidenceLevel) };
}

/** Human-readable recommendation based on experiment results */
export function buildRecommendation(
  control: GroupStats,
  treatment: GroupStats,
  significant: boolean,
  winner: GroupName | null,
  minSamples: number,
): string {
  const total = control.total + treatment.total;
  if (total < minSamples) {
    return `Insufficient data: ${total}/${minSamples} samples collected`;
  }
  if (!significant) {
    return 'No statistically significant difference detected — continue experiment';
  }
  const ctrlPct = (control.accuracy * 100).toFixed(1);
  const treatPct = (treatment.accuracy * 100).toFixed(1);
  return `Significant: ${winner} group outperforms. Control: ${ctrlPct}%, Treatment: ${treatPct}%`;
}

/** Standard normal CDF approximation (Abramowitz & Stegun) */
function normalCDF(x: number): number {
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
  const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const sign = x >= 0 ? 1 : -1;
  const absX = Math.abs(x) / Math.sqrt(2);
  const t = 1.0 / (1.0 + p * absX);
  const poly = ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t;
  const y = 1.0 - poly * Math.exp(-absX * absX);
  return 0.5 * (1.0 + sign * y);
}
