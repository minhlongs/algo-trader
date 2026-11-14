/**
 * Deflated Sharpe mathematical primitives.
 *
 * Local implementations (no dependency) of the error function, standard normal
 * CDF and its inverse, and the Gumbel approximation to the expected maximum of
 * N Sharpe estimates under the null. Used by `deflated-sharpe.ts`.
 */

/** Euler–Mascheroni constant γ, as used by the Gumbel maximum approximation. */
export const EULER_MASCHERONI = 0.5772156649015329;

/**
 * Error function — Abramowitz & Stegun 7.1.26 (max absolute error 1.5e-7).
 * Sufficient for confidence probabilities, and stable in both tails.
 */
export function erf(x: number): number {
  if (x === 0) return 0;
  const sign = x < 0 ? -1 : 1;
  const absX = Math.abs(x);

  const p = 0.3275911;
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;

  const t = 1 / (1 + p * absX);
  const poly = ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t;
  return sign * (1 - poly * Math.exp(-absX * absX));
}

/** Standard normal cumulative distribution function. */
export function normalCdf(x: number): number {
  return 0.5 * (1 + erf(x / Math.SQRT2));
}

/**
 * Inverse standard normal CDF, p in (0, 1).
 *
 * Bisection over `normalCdf` — deliberately not a closed-form rational
 * approximation, so the inverse is exactly consistent with the forward CDF
 * this module ships. Deterministic, 100 iterations (machine precision).
 */
export function inverseNormalCdf(p: number): number {
  if (!(p > 0 && p < 1)) {
    throw new RangeError(`inverseNormalCdf requires p in (0, 1); got ${p}`);
  }
  let low = -40;
  let high = 40;
  for (let iteration = 0; iteration < 100; iteration++) {
    const mid = (low + high) / 2;
    if (normalCdf(mid) < p) low = mid;
    else high = mid;
  }
  return (low + high) / 2;
}

/**
 * Expected maximum of `nTrials` independent Sharpe estimates drawn from a null
 * distribution with standard deviation `trialSharpeStdDev`.
 *
 * Gumbel (extreme-value) approximation from Bailey & López de Prado:
 *
 *   E[max] ≈ σ · [ (1 − γ) · Φ⁻¹(1 − 1/N) + γ · Φ⁻¹(1 − 1/(N·e)) ]
 *
 * A single trial has no selection bias, so N <= 1 returns 0.
 */
export function expectedMaxSharpe(nTrials: number, trialSharpeStdDev: number): number {
  if (!(nTrials > 1)) return 0;
  // Clamp so an astronomically large trial count cannot round the quantile
  // argument to exactly 1 (which inverseNormalCdf rejects).
  const clampProbability = (p: number): number => Math.min(1 - 1e-12, Math.max(1e-12, p));
  const lowerQuantile = inverseNormalCdf(clampProbability(1 - 1 / nTrials));
  const upperQuantile = inverseNormalCdf(clampProbability(1 - 1 / (nTrials * Math.E)));
  return (
    trialSharpeStdDev *
    ((1 - EULER_MASCHERONI) * lowerQuantile + EULER_MASCHERONI * upperQuantile)
  );
}
