/**
 * Statistical Validation Types
 *
 * Shared types and deterministic primitives for the statistical validation
 * engine: Monte Carlo permutation test and bootstrap Sharpe confidence
 * intervals. Concept ported from upstream validation.py; implemented natively
 * in TypeScript (no Python vendored).
 */

// ── Deterministic primitives ─────────────────────────────────────────────────

/** Seeded PRNG (mulberry32). Deterministic across runs for reproducibility. */
export function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function mean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/** Population standard deviation (matches numpy default). */
export function stdDev(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const m = mean(values);
  const variance = values.reduce((sum, v) => sum + (v - m) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

/** Linear-interpolated percentile, p in [0, 100] (numpy-compatible). */
export function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);
  if (lower === upper) return sorted[lower]!;
  const frac = idx - lower;
  return sorted[lower]! * (1 - frac) + sorted[upper]! * frac;
}

/** Annualised Sharpe from per-bar returns (epsilon guards zero std). */
export function annualizedSharpe(
  returns: readonly number[],
  barsPerYear: number,
): number {
  const m = mean(returns);
  const s = stdDev(returns);
  return (m / (s + 1e-10)) * Math.sqrt(barsPerYear);
}

export const DEFAULT_SIMULATION_SEED = 42;
export const DEFAULT_N_SIMULATIONS = 1000;
export const DEFAULT_BARS_PER_YEAR = 252;

// ── Monte Carlo permutation test ─────────────────────────────────────────────

export interface MonteCarloOptions {
  /** Starting capital for equity path reconstruction. Must be > 0. */
  initialCapital: number;
  /** Number of random permutations. Default 1000, must be integer >= 1. */
  nSimulations?: number;
  /** PRNG seed. Default 42, must be integer >= 0. */
  seed?: number;
  /** Annualisation factor for Sharpe. Default 252. */
  barsPerYear?: number;
}

export interface MonteCarloSuccess {
  ok: true;
  /** Sharpe of the observed (unshuffled) PnL path */
  actualSharpe: number;
  /** Max drawdown of the observed path as a negative fraction (-0.12 = 12%) */
  actualMaxDrawdown: number;
  /** Fraction of permutations with Sharpe >= actual. Lower = more significant. */
  pValueSharpe: number;
  /** Fraction of permutations with max drawdown >= actual (shallower/equal). */
  pValueMaxDrawdown: number;
  simulatedSharpeMean: number;
  simulatedSharpeStd: number;
  simulatedSharpeP5: number;
  simulatedSharpeP95: number;
  nSimulations: number;
  nTrades: number;
  seed: number;
}

export interface MonteCarloErrorResult {
  ok: false;
  error: string;
  /** Conservative p-value so callers gating on significance never pass. */
  pValueSharpe: 1;
}

export type MonteCarloResult = MonteCarloSuccess | MonteCarloErrorResult;

// ── Bootstrap Sharpe CI ──────────────────────────────────────────────────────

export interface BootstrapOptions {
  /** Number of bootstrap resamples. Default 1000, must be integer >= 1. */
  nBootstrap?: number;
  /** Confidence level in (0, 1). Default 0.95. */
  confidence?: number;
  /** PRNG seed. Default 42, must be integer >= 0. */
  seed?: number;
  /** Annualisation factor. Default 252. */
  barsPerYear?: number;
}

export interface BootstrapSuccess {
  ok: true;
  observedSharpe: number;
  ciLower: number;
  ciUpper: number;
  medianSharpe: number;
  /** Fraction of bootstrap samples with Sharpe > 0. */
  probPositive: number;
  confidence: number;
  nBootstrap: number;
  seed: number;
}

export interface BootstrapErrorResult {
  ok: false;
  error: string;
}

export type BootstrapResult = BootstrapSuccess | BootstrapErrorResult;

// ── Gate input ───────────────────────────────────────────────────────────────

/** Precomputed statistical validation outputs consumed by the gate evaluator. */
export interface StatisticalSignificanceInput {
  /** Monte Carlo p-value for Sharpe. Gate requires < 0.05. */
  pValueSharpe: number;
  /** Bootstrap Sharpe CI lower bound. Gate requires > 0. */
  sharpeCiLower: number;
}