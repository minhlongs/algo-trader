/**
 * Drawdown Monitor Alerts & Throttling Evaluators
 *
 * Alert formatting, message synthesis, and alert throttling checks.
 */

import type { DrawdownAlert } from '@desk/risk';
import type { DrawdownThresholdEvaluation } from './drawdown-monitor-types';

const PCT = (v: number) => `${(v * 100).toFixed(2)}%`;

export function formatThresholdLabel(type: DrawdownThresholdEvaluation['type']): string {
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

/** Check if currently within a halt period. Returns true if halt is indefinite or hasn't expired. */
export function isWithinHaltPeriod(haltedUntilMs: number | undefined, nowMs: number): boolean {
  if (haltedUntilMs == null) return true; // indefinite halt
  return haltedUntilMs > 0 && nowMs < haltedUntilMs;
}
