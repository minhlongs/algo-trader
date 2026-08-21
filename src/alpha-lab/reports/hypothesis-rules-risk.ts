/**
 * Hypothesis Detection Rules — Risk & Position Sizing
 *
 * Rules b (stop-loss), c (drawdown), d (profit factor), h (sample size).
 * All rules are deterministic and pure — no side effects, no randomness.
 */

import type { Hypothesis } from './hypothesis-generator';
import type { EvaluationReport } from '../evaluation/evaluation-types';

const DRAWDOWN_THRESHOLD = 0.3;
const PROFIT_FACTOR_THRESHOLD = 1.5;
const WIN_RATE_HIGH = 0.5;
const MIN_TRADES_SAMPLE = 30;

function clampConfidence(value: number): number {
  return Math.max(0, Math.min(1, value));
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
