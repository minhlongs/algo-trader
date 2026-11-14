/**
 * Evaluator for Governance KPI #5 (Fill Rate: Live-vs-Sim maker fill divergence,
 * multi-leg complete-basket rate, and post-only rejection rate).
 */

import { KPI_THRESHOLDS, type KpiEvaluationInput, type KpiRowResult } from './kpi-poly-types';

export function evaluateFillRateKpi(exec: KpiEvaluationInput['execution']): KpiRowResult {
  const threshold = 'Live-vs-Sim div < 20% & complete-basket >= 92% (NO-GO <85% or reject >30%)';
  const basketPct =
    exec.basketAttempts > 0 ? (exec.completeBaskets / exec.basketAttempts) * 100 : null;
  const rejectPct =
    exec.postOnlySubmitted > 0 ? (exec.postOnlyRejected / exec.postOnlySubmitted) * 100 : null;
  const divPct =
    exec.simMakerFillRate !== null && exec.liveMakerFillRate !== null && exec.simMakerFillRate > 0
      ? (Math.abs(exec.liveMakerFillRate - exec.simMakerFillRate) / exec.simMakerFillRate) * 100
      : null;

  if (
    (basketPct !== null && basketPct < KPI_THRESHOLDS.NOGO_BASKET_COMPLETION_FLOOR_PCT) ||
    (rejectPct !== null && rejectPct > KPI_THRESHOLDS.NOGO_POST_ONLY_REJECT_MAX_PCT)
  ) {
    const metric = basketPct ?? rejectPct ?? 0;
    return {
      id: 5,
      name: 'Fill Rate',
      numericValue: metric,
      formattedValue: `basket=${basketPct?.toFixed(1) ?? 'n/a'}% rej=${rejectPct?.toFixed(1) ?? 'n/a'}%`,
      threshold,
      verdict: 'NO-GO',
      reason: 'Basket completion <85% or post-only reject >30%',
    };
  }
  if (divPct === null || basketPct === null) {
    const simStr =
      exec.simMakerFillRate !== null
        ? `sim=${(exec.simMakerFillRate * 100).toFixed(1)}%`
        : 'NOT ENOUGH DATA';
    return {
      id: 5,
      name: 'Fill Rate',
      numericValue: exec.simMakerFillRate,
      formattedValue: simStr,
      threshold,
      verdict: 'NOT ENOUGH DATA',
      reason:
        divPct === null
          ? 'No live maker fills to compare against sim'
          : '0 multi-leg basket attempts',
    };
  }
  const ok =
    divPct < KPI_THRESHOLDS.GO_FILL_DIVERGENCE_MAX_PCT &&
    basketPct >= KPI_THRESHOLDS.GO_BASKET_COMPLETION_MIN_PCT;
  return {
    id: 5,
    name: 'Fill Rate',
    numericValue: divPct,
    formattedValue: `div=${divPct.toFixed(1)}% basket=${basketPct.toFixed(1)}%`,
    threshold,
    verdict: ok ? 'GO' : 'NO-GO',
    reason: `post-only reject=${rejectPct?.toFixed(1) ?? '0.0'}%`,
  };
}
