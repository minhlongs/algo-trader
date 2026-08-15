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

// ── Single-Threshold Evaluations ──────────────────────────────────────────────

/** Evaluate daily drawdown against threshold. */
export function evaluateDailyDrawdown(
  metrics: DrawdownMetrics,
  config: DrawdownThresholdConfig = DEFAULT_THRESHOLD_CONFIG,
): DrawdownThresholdEvaluation {
  const current = metrics.dailyDrawdown;
  const threshold = config.dailyDrawdownLimit;
  return {
    type: 'daily',
    breached: current >= threshold,
    current,
    threshold,
    headroom: threshold - current,
  };
}

/** Evaluate total (peak-to-current) drawdown against threshold. */
export function evaluateTotalDrawdown(
  metrics: DrawdownMetrics,
  config: DrawdownThresholdConfig = DEFAULT_THRESHOLD_CONFIG,
): DrawdownThresholdEvaluation {
  const current = metrics.currentDrawdown;
  const threshold = config.totalDrawdownLimit;
  return {
    type: 'total',
    breached: current >= threshold,
    current,
    threshold,
    headroom: threshold - current,
  };
}

/** Evaluate consecutive losses against threshold. */
export function evaluateConsecutiveLosses(
  metrics: DrawdownMetrics,
  config: DrawdownThresholdConfig = DEFAULT_THRESHOLD_CONFIG,
): DrawdownThresholdEvaluation {
  const current = metrics.consecutiveLosses;
  const threshold = config.consecutiveLossLimit;
  return {
    type: 'consecutive',
    breached: current >= threshold,
    current,
    threshold,
    headroom: threshold - current,
  };
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

// ── Alert Builder ─────────────────────────────────────────────────────────────

/** Build DrawdownAlert objects for each breached threshold. */
export function buildAlerts(
  evaluations: DrawdownThresholdEvaluation[],
): DrawdownAlert[] {
  return evaluations
    .filter((e) => e.breached)
    .map((e) => ({
      type: e.type,
      threshold: e.threshold,
      current: e.current,
      triggeredAt: Date.now(),
      message: formatAlertMessage(e),
    }));
}

// ── Formatting ────────────────────────────────────────────────────────────────

const PCT = (v: number) => `${(v * 100).toFixed(2)}%`;

function formatThresholdLabel(type: DrawdownThresholdEvaluation['type']): string {
  return type === 'daily' ? 'Daily drawdown' : type === 'total' ? 'Total drawdown' : 'Consecutive losses';
}

/** Format human-readable alert message for a breached threshold. */
export function formatAlertMessage(e: DrawdownThresholdEvaluation): string {
  if (e.type === 'consecutive') return `${e.current} consecutive losses exceeded limit of ${e.threshold}`;
  return `${formatThresholdLabel(e.type)} ${PCT(e.current)} breached limit of ${PCT(e.threshold)}`;
}

/** Format halt reason string from a threshold evaluation. */
export function formatHaltReason(e: DrawdownThresholdEvaluation): string {
  if (e.type === 'consecutive') return `${e.current} consecutive losses`;
  return `${formatThresholdLabel(e.type)} ${PCT(e.current)} breached`;
}

// ── Alert Throttling ──────────────────────────────────────────────────────────

/** Determine whether an alert should be suppressed due to throttling. */
export function shouldThrottleAlert(
  lastAlertAtMs: number,
  nowMs: number,
  throttleMs: number = 15 * 60 * 1000,
): boolean {
  if (lastAlertAtMs <= 0) return false;
  if (throttleMs <= 0) return false;
  return nowMs - lastAlertAtMs < throttleMs;
}

// ── Halt Period Check ─────────────────────────────────────────────────────────

/** Check if currently within a halt period. Returns true if halt is indefinite or hasn't expired. */
export function isWithinHaltPeriod(haltedUntilMs: number | undefined, nowMs: number): boolean {
  if (haltedUntilMs == null) return true; // indefinite halt
  return haltedUntilMs > 0 && nowMs < haltedUntilMs;
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
