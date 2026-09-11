/**
 * Vetting Rules Engine
 * Pure evaluation functions for automated strategy backtest checks.
 * Stateless — accepts strategy data and returns VettingResult.
 */

import type { BacktestSummary } from '../models/types';
import type { VettingCheck, VettingResult } from './vetting-types';

function checkMetric<T>(
  name: string,
  value: T | undefined,
  predicate: (v: number) => boolean,
  displayValue: string,
): VettingCheck {
  const passed = value !== undefined && predicate(value as number);
  return {
    name,
    passed,
    detail: passed
      ? `${displayValue} meets threshold`
      : `${displayValue} does not meet threshold`,
  };
}

/**
 * Evaluate a strategy's backtest summary against quantitative thresholds.
 * Thresholds: Sharpe >= 1.0, MaxDrawdown <= 20%, WinRate >= 45%, Period >= 90d.
 */
export function evaluateStrategyBacktest(backtestSummary: BacktestSummary | undefined): VettingResult {
  const checks: VettingCheck[] = [];
  let score = 100;

  // Sharpe ratio check (>= 1.0)
  const sharpeCheck = checkMetric(
    'Sharpe Ratio',
    backtestSummary?.sharpe,
    (v) => v >= 1.0,
    backtestSummary?.sharpe?.toFixed(2) || 'N/A',
  );
  checks.push(sharpeCheck);
  if (!sharpeCheck.passed) score -= 30;

  // Max drawdown check (<= 20%)
  const ddCheck = checkMetric(
    'Max Drawdown',
    backtestSummary?.maxDrawdown,
    (v) => v <= 20,
    `${backtestSummary?.maxDrawdown?.toFixed(1)}%`,
  );
  checks.push(ddCheck);
  if (!ddCheck.passed) score -= 30;

  // Win rate check (>= 45%)
  const wrCheck = checkMetric(
    'Win Rate',
    backtestSummary?.winRate,
    (v) => v >= 45,
    `${backtestSummary?.winRate?.toFixed(1)}%`,
  );
  checks.push(wrCheck);
  if (!wrCheck.passed) score -= 25;

  // Period check (>= 90 days)
  const periodCheck = checkMetric(
    'Backtest Period',
    backtestSummary?.periodDays,
    (v) => v >= 90,
    `${backtestSummary?.periodDays || 0} days`,
  );
  checks.push(periodCheck);
  if (!periodCheck.passed) score -= 15;

  const approved = checks.every((c) => c.passed);
  const feedback = checks
    .filter((c) => !c.passed)
    .map((c) => `${c.name}: ${c.detail}`)
    .join('; ') || 'All checks passed';

  return { approved, score, feedback, checks };
}
