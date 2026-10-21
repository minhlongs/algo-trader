/**
 * Drawdown Monitor Evaluators
 *
 * Pure evaluation functions for drawdown threshold checking and tier determination.
 * No Redis, no side effects — safe for unit testing and deterministic replay.
 *
 * Extracted from DrawdownMonitor (desk) and DrawdownMonitorService (platform)
 * to enable isolated testing of evaluation logic.
 */

import type { DrawdownMetrics, DrawdownAlert } from '@desk/risk';
import {
  DrawdownAlertTier,
  type DrawdownThresholdConfig,
  type DrawdownThresholdEvaluation,
  type DrawdownEvaluationResult,
  DEFAULT_THRESHOLD_CONFIG,
} from './drawdown-monitor-types';
import {
  formatThresholdLabel,
  formatAlertMessage,
  formatHaltReason,
  buildAlerts,
  shouldThrottleAlert,
  isWithinHaltPeriod,
} from './drawdown-monitor-alerts-eval';
import { evaluateThreshold } from './drawdown-threshold-evaluator';

export {
  formatThresholdLabel,
  formatAlertMessage,
  formatHaltReason,
  buildAlerts,
  shouldThrottleAlert,
  isWithinHaltPeriod,
};

// ── Single-Threshold Evaluations ──────────────────────────────────────────────

/** Evaluate daily drawdown against threshold. */
export function evaluateDailyDrawdown(
  metrics: DrawdownMetrics,
  config: DrawdownThresholdConfig = DEFAULT_THRESHOLD_CONFIG,
): DrawdownThresholdEvaluation {
  return evaluateThreshold('daily', metrics.dailyDrawdown, config.dailyDrawdownLimit);
}

/** Evaluate total (peak-to-current) drawdown against threshold. */
export function evaluateTotalDrawdown(
  metrics: DrawdownMetrics,
  config: DrawdownThresholdConfig = DEFAULT_THRESHOLD_CONFIG,
): DrawdownThresholdEvaluation {
  return evaluateThreshold('total', metrics.currentDrawdown, config.totalDrawdownLimit);
}

/** Evaluate consecutive losses against threshold. */
export function evaluateConsecutiveLosses(
  metrics: DrawdownMetrics,
  config: DrawdownThresholdConfig = DEFAULT_THRESHOLD_CONFIG,
): DrawdownThresholdEvaluation {
  return evaluateThreshold('consecutive', metrics.consecutiveLosses, config.consecutiveLossLimit);
}

// ── Aggregate Evaluation ──────────────────────────────────────────────────────

/** Run all threshold evaluations and produce aggregated result. */
export function evaluateAllThresholds(
  metrics: DrawdownMetrics,
  config: DrawdownThresholdConfig = DEFAULT_THRESHOLD_CONFIG,
): DrawdownEvaluationResult {
  const evaluations = [
    evaluateDailyDrawdown(metrics, config),
    evaluateTotalDrawdown(metrics, config),
    evaluateConsecutiveLosses(metrics, config),
  ];
  const tier = determineAlertTier(evaluations);
  const halt = shouldHaltTrading(evaluations, config, metrics.isHalted);
  return { evaluations, tier, shouldHalt: halt.halt, haltReason: halt.reason, alerts: buildAlerts(evaluations) };
}

// ── Tier Determination ────────────────────────────────────────────────────────

/** Determine alert tier from threshold evaluations. Priority: EMERGENCY > CRITICAL > WARNING > NORMAL. */
export function determineAlertTier(
  evaluations: DrawdownThresholdEvaluation[],
): DrawdownAlertTier {
  const breachCount = evaluations.filter((e) => e.breached).length;

  if (breachCount >= 3) return DrawdownAlertTier.EMERGENCY;
  if (breachCount === 2) return DrawdownAlertTier.CRITICAL;
  if (breachCount === 1) return DrawdownAlertTier.WARNING;
  return DrawdownAlertTier.NORMAL;
}

// ── Halt Decision ─────────────────────────────────────────────────────────────

export interface HaltDecision {
  halt: boolean;
  reason?: string;
}

/** Determine whether trading should be halted. Halts if haltOnBreach is set and any threshold is breached. */
export function shouldHaltTrading(
  evaluations: DrawdownThresholdEvaluation[],
  config: DrawdownThresholdConfig = DEFAULT_THRESHOLD_CONFIG,
  currentlyHalted: boolean = false,
): HaltDecision {
  if (currentlyHalted) return { halt: true, reason: 'Already halted' };
  if (!config.haltOnBreach) return { halt: false };
  const breached = evaluations.filter((e) => e.breached);
  if (breached.length === 0) return { halt: false };
  // Pick highest-priority breach: daily > total > consecutive
  const priority = ['daily', 'total', 'consecutive'] as const;
  const topBreach = breached.sort((a, b) => priority.indexOf(a.type) - priority.indexOf(b.type))[0];
  return { halt: true, reason: formatHaltReason(topBreach) };
}

// ── Metric Sanity Guards ──────────────────────────────────────────────────────

/** Clamp drawdown values to [0, 1] range. Rejects negative peaks. */
export function clampDrawdownValue(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

/** Validate that metrics are internally consistent. Returns list of validation errors (empty = valid). */
export function validateMetricsIntegrity(m: DrawdownMetrics): string[] {
  const e: string[] = [];
  if (m.peakValue <= 0) e.push('peakValue must be positive');
  if (m.currentValue < 0) e.push('currentValue must be non-negative');
  if (m.dailyDrawdown < 0 || m.dailyDrawdown > 1) e.push('dailyDrawdown must be in [0, 1]');
  if (m.currentDrawdown < 0 || m.currentDrawdown > 1) e.push('currentDrawdown must be in [0, 1]');
  if (m.consecutiveLosses < 0 || !Number.isInteger(m.consecutiveLosses)) e.push('consecutiveLosses must be a non-negative integer');
  return e;
}
