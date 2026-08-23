/**
 * Hypothesis Detection Rules — Regime, Seasonality & Quality
 *
 * Rules a (regime filter), e (seasonality), f (volatility), g (overfitting).
 * All rules are deterministic and pure — no side effects, no randomness.
 */

import type { Hypothesis } from './hypothesis-generator';
import type { EvaluationReport } from '../evaluation/evaluation-types';
import type { CandidateResult } from '../attribution/alpha-evaluator';
import type { BaselineRun } from '../baselines/baseline-runner';

function clampConfidence(value: number): number {
  return Math.max(0, Math.min(1, value));
}

// ── Rule (a): Regime-Specific Edge ───────────────────────────────────────────

export function detectRegimeFilter(eval_: EvaluationReport): Hypothesis[] {
  const regimes = eval_.byRegime;
  if (regimes.length < 2) return [];

  const best = regimes.reduce((a, b) => (a.netPnl > b.netPnl ? a : b));
  if (best.netPnl <= 0) return [];

  const others = regimes.filter((r) => r.regime !== best.regime);
  if (!others.every((r) => r.netPnl < 0)) return [];

  const gap = best.netPnl - Math.max(...others.map((r) => r.netPnl));
  const confidence = clampConfidence(Math.min(gap * 10, 1));

  return [{
    name: 'Regime-Specific Edge',
    description: `Strategy works specifically in ${best.regime}; add a regime filter`,
    features: ['regimeFilter'],
    regimeFilter: [best.regime],
    entryCondition: `market regime is ${best.regime}`,
    exitCondition: `market regime changes away from ${best.regime}`,
    expectedMechanism:
      `The strategy's edge is concentrated in ${best.regime} where netPnl was ${best.netPnl.toFixed(4)} vs other regimes below zero.`,
    confidence,
    evidence: [
      `Best regime: ${best.regime} (netPnl=${best.netPnl.toFixed(4)})`,
      ...others.map((r) => `${r.regime} (netPnl=${r.netPnl.toFixed(4)})`),
    ],
  }];
}

// ── Rule (e): Seasonality Filter ─────────────────────────────────────────────

export function detectSeasonality(eval_: EvaluationReport): Hypothesis[] {
  const months = eval_.byMonth;
  if (months.length < 3) return [];

  const pnls = months.map((m) => m.netPnl);
  const mean = pnls.reduce((a, b) => a + b, 0) / pnls.length;
  const variance = pnls.reduce((s, p) => s + (p - mean) ** 2, 0) / pnls.length;
  const cv = mean !== 0 ? Math.abs(Math.sqrt(variance) / mean) : 0;

  if (cv <= 1.5) return [];

  const confidence = clampConfidence(Math.min(cv / 4, 1));
  const goodMonths = months.filter((m) => m.netPnl > 0).map((m) => m.month);
  const badMonths = months.filter((m) => m.netPnl < 0).map((m) => m.month);

  return [{
    name: 'Seasonality Filter',
    description:
      'Performance varies by month; test seasonality or skip low-performing months',
    features: ['seasonalityFilter', 'calendarFilter'],
    regimeFilter: 'all',
    entryCondition: 'month is in the high-performing set',
    exitCondition: 'month enters low-performing set',
    expectedMechanism:
      `Coefficient of variation ${cv.toFixed(2)} across months indicates seasonal patterns.`,
    confidence,
    evidence: [
      `CV of monthly PnL: ${cv.toFixed(2)} (>1.5)`,
      ...(goodMonths.length > 0 ? [`Positive months: ${goodMonths.join(', ')}`] : []),
      ...(badMonths.length > 0 ? [`Negative months: ${badMonths.join(', ')}`] : []),
    ],
  }];
}

// ── Rule (f): Volatility Filter ──────────────────────────────────────────────

export function detectVolatilityDegradation(eval_: EvaluationReport): Hypothesis[] {
  const buckets = eval_.byVolatilityBucket;
  if (buckets.length < 2) return [];

  const highVol = buckets.find((b) => b.bucket === 'high');
  if (!highVol) return [];

  const nonHigh = buckets.filter((b) => b.bucket !== 'high');
  const bestNonHigh = nonHigh.reduce((a, b) => (a.netPnl > b.netPnl ? a : b));

  if (highVol.netPnl >= bestNonHigh.netPnl) return [];

  const gap = bestNonHigh.netPnl - highVol.netPnl;
  const confidence = clampConfidence(Math.min(gap * 10, 1));
  return [{
    name: 'Volatility Filter',
    description:
      'Strategy degrades in high volatility; add a volatility filter or reduce size in high-vol regimes',
    features: ['volatilityFilter', 'positionSizing'],
    regimeFilter: 'all',
    entryCondition: 'realized volatility is low or medium',
    exitCondition: 'volatility spikes above threshold',
    expectedMechanism:
      `High-vol netPnl (${highVol.netPnl.toFixed(4)}) underperforms ` +
      `${bestNonHigh.bucket} (${bestNonHigh.netPnl.toFixed(4)}).`,
    confidence,
    evidence: [
      `High-vol netPnl: ${highVol.netPnl.toFixed(4)}`,
      `Best non-high-vol (${bestNonHigh.bucket}): ${bestNonHigh.netPnl.toFixed(4)}`,
    ],
  }];
}

// ── Rule (g): Overfitting Warning ────────────────────────────────────────────

export function detectOverfit(
  candidate: CandidateResult,
  baselines: BaselineRun[],
): Hypothesis[] {
  const buyHold = baselines.find((b) => b.name === 'buy-and-hold');
  const random = baselines.find((b) => b.name === 'random-entry');
  if (!buyHold || !random) return [];

  const beatsBuyHold = candidate.totalNetPnl > buyHold.report.totalPnl;
  const losesToRandom = candidate.totalNetPnl <= random.report.totalPnl;

  if (!beatsBuyHold || !losesToRandom) return [];

  return [{
    name: 'Overfitting Warning',
    description:
      'Edge is not robust; the strategy may be overfit — reduce feature count and re-test with fewer parameters',
    features: ['featureReduction', 'regularization'],
    regimeFilter: 'all',
    entryCondition: 'simplified entry with fewer features',
    exitCondition: 'standard exit',
    expectedMechanism:
      'Beating buy-hold but losing to random entry suggests the strategy captures noise, not a genuine edge.',
    confidence: clampConfidence(0.7),
    evidence: [
      `Candidate PnL: ${candidate.totalNetPnl.toFixed(4)}`,
      `Buy-hold PnL: ${buyHold.report.totalPnl.toFixed(4)} (beats)`,
      `Random-entry PnL: ${random.report.totalPnl.toFixed(4)} (loses to)`,
    ],
  }];
}