/**
 * Hypothesis Detection Rules
 *
 * Each rule inspects the evaluation report and returns zero or one Hypothesis.
 * All rules are deterministic and pure — no side effects, no randomness.
 */

import type { Hypothesis } from './hypothesis-generator';
import type { EvaluationReport } from '../evaluation/evaluation-types';
import type { CandidateResult } from '../attribution/alpha-evaluator';
import type { BaselineRun } from '../baselines/baseline-runner';

const DRAWDOWN_THRESHOLD = 0.3;
const PROFIT_FACTOR_THRESHOLD = 1.5;
const WIN_RATE_HIGH = 0.5;
const MIN_TRADES_SAMPLE = 30;

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

// ── Rule (b): Stop-Loss Tightening ───────────────────────────────────────────

export function detectStopLoss(eval_: EvaluationReport): Hypothesis[] {
  const o = eval_.overall;
  if (o.winRate <= WIN_RATE_HIGH || o.sharpeRatio >= 0) return [];

  const confidence = clampConfidence(Math.min(Math.abs(o.sharpeRatio) * 0.5, 1));
  return [{
    name: 'Stop-Loss Tightening',
    description:
      'Win rate is high but losers are large; tighten stop-loss or reduce position size on losing trades',
    features: ['stopLoss', 'positionSizing'],
    regimeFilter: 'all',
    entryCondition: 'standard entry signal',
    exitCondition: 'tighter stop-loss triggered',
    expectedMechanism:
      'High win rate with negative Sharpe suggests large losing trades dragging risk-adjusted returns.',
    confidence,
    evidence: [
      `Win rate: ${o.winRate.toFixed(3)} (>0.5)`,
      `Sharpe ratio: ${o.sharpeRatio.toFixed(3)} (<0)`,
    ],
  }];
}

// ── Rule (c): Drawdown Reduction ─────────────────────────────────────────────

export function detectDrawdown(eval_: EvaluationReport): Hypothesis[] {
  const dd = eval_.overall.maxDrawdown;
  if (dd <= DRAWDOWN_THRESHOLD) return [];

  const severity = (dd - DRAWDOWN_THRESHOLD) / 0.4;
  const confidence = clampConfidence(severity);
  return [{
    name: 'Drawdown Reduction',
    description:
      'Drawdown too large; add drawdown-based position sizing or reduce leverage',
    features: ['positionSizing', 'drawdownGuard'],
    regimeFilter: 'all',
    entryCondition: 'standard entry with reduced size during drawdown',
    exitCondition: 'stop-loss or drawdown limit hit',
    expectedMechanism:
      `Max drawdown of ${(dd * 100).toFixed(1)}% exceeds ${(DRAWDOWN_THRESHOLD * 100).toFixed(0)}%. ` +
      'Reducing position size during drawdown periods limits peak-to-trough loss.',
    confidence,
    evidence: [
      `Max drawdown: ${(dd * 100).toFixed(1)}% (threshold: ${(DRAWDOWN_THRESHOLD * 100).toFixed(0)}%)`,
    ],
  }];
}

// ── Rule (d): Profit Factor Improvement ──────────────────────────────────────

export function detectProfitFactor(eval_: EvaluationReport): Hypothesis[] {
  const pf = eval_.overall.profitFactor;
  if (pf >= PROFIT_FACTOR_THRESHOLD || pf <= 0) return [];

  const confidence = clampConfidence(1 - pf / PROFIT_FACTOR_THRESHOLD);
  return [{
    name: 'Profit Factor Improvement',
    description:
      'Profit factor low; the edge is thin — look for better entry timing or higher-conviction signals',
    features: ['entryTiming', 'signalFilter'],
    regimeFilter: 'all',
    entryCondition: 'higher-conviction entry signal only',
    exitCondition: 'standard exit',
    expectedMechanism:
      `Profit factor of ${pf.toFixed(2)} is below ${PROFIT_FACTOR_THRESHOLD}. ` +
      'Strategy gains are only marginally larger than losses.',
    confidence,
    evidence: [
      `Profit factor: ${pf.toFixed(2)} (threshold: ${PROFIT_FACTOR_THRESHOLD})`,
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

// ── Rule (h): Sample Size Increase ───────────────────────────────────────────

export function detectSmallSample(eval_: EvaluationReport): Hypothesis[] {
  if (eval_.overall.totalTrades >= MIN_TRADES_SAMPLE) return [];

  const ratio = eval_.overall.totalTrades / MIN_TRADES_SAMPLE;
  const confidence = clampConfidence(1 - ratio);
  return [{
    name: 'Sample Size Increase',
    description:
      'Sample size too small; increase test period or reduce lookback to get more independent samples',
    features: ['lookback', 'testPeriod'],
    regimeFilter: 'all',
    entryCondition: 'same entry logic with more data',
    exitCondition: 'same exit logic',
    expectedMechanism:
      `Only ${eval_.overall.totalTrades} trades observed. Need at least ${MIN_TRADES_SAMPLE} for statistical significance.`,
    confidence,
    evidence: [
      `Total trades: ${eval_.overall.totalTrades} (minimum: ${MIN_TRADES_SAMPLE})`,
    ],
  }];
}
