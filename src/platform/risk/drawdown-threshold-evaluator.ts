/**
 * Single-Threshold Drawdown Evaluation
 *
 * Shared shape of "compare one metric against its configured limit". All three
 * drawdown thresholds (daily, total, consecutive losses) are the same
 * comparison, so they build on one helper instead of repeating it.
 */

import type { DrawdownThresholdEvaluation } from './drawdown-monitor-types';

/** The three drawdown dimensions that can breach independently. */
export type DrawdownThresholdType = 'daily' | 'total' | 'consecutive';

/**
 * Evaluate one metric against its threshold.
 *
 * `breached` uses `>=` so sitting exactly at the limit counts as a breach —
 * the limit is an inclusive ceiling, not a target.
 */
export function evaluateThreshold(
  type: DrawdownThresholdType,
  current: number,
  threshold: number,
): DrawdownThresholdEvaluation {
  return {
    type,
    breached: current >= threshold,
    current,
    threshold,
    headroom: threshold - current,
  };
}
