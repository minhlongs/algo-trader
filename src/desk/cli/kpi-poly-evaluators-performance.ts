/**
 * Evaluators for Governance KPIs 1–5 (Performance, Risk-Adjusted Return,
 * Drawdown, Profit Factor, and Fill Rate) — Architecture Report pp. 60–61.
 */

import {
  computeMaxDrawdown,
  computeProfitFactor,
  computeSortinoRatio,
} from '../backtesting/metrics-calculator';
import {
  computeKurtosis,
  computeSkewness,
  equityCurveToReturns,
} from '../backtesting/metrics-calculator-robustness';
import {
  computeWalkForwardRobustness,
  type WalkForwardRobustnessObservation,
} from '../backtesting/walk-forward-robustness-pipeline';
import { KPI_THRESHOLDS, type KpiEvaluationInput, type KpiRowResult } from './kpi-poly-types';

const MIN_RETURNS_FOR_WALK_FORWARD = 20;

function buildWalkForwardObservations(
  perf: KpiEvaluationInput['performance'],
): WalkForwardRobustnessObservation[] {
  const returns = equityCurveToReturns(perf.equityCurve);
  return returns.map((returnValue, idx) => ({
    returnValue,
    ...(perf.liquidity?.[idx] ? { liquidity: perf.liquidity[idx] } : {}),
  }));
}

export function evaluateNetPnlKpi(perf: KpiEvaluationInput['performance']): KpiRowResult {
  const threshold = '95% Bootstrap CI lower > 0 across WF & >=21d Paper/Shadow (NO-GO <=0 or 1-event)';
  if (perf.closedCycles.length === 0) {
    return {
      id: 1, name: 'Net PnL', numericValue: null, formattedValue: 'NOT ENOUGH DATA',
      threshold, verdict: 'NOT ENOUGH DATA', reason: '0 closed trade cycles observed',
    };
  }
  const oppCost =
    perf.lockedCapitalAvgPusd *
    KPI_THRESHOLDS.LOCKED_CAPITAL_OPP_COST_ANNUAL *
    (Math.max(0, perf.observationSpanDays) / 365);
  const grossCycleNet = perf.closedCycles.reduce((acc, c) => acc + c.netPnlPusd, 0);
  const netPnl = grossCycleNet - perf.relayerAndApiCostPusd - oppCost;

  const byCluster = new Map<string, number>();
  for (const cycle of perf.closedCycles) {
    byCluster.set(cycle.eventClusterId, (byCluster.get(cycle.eventClusterId) ?? 0) + cycle.netPnlPusd);
  }
  const maxClusterPnl = Math.max(...byCluster.values());
  const formattedValue = `${netPnl >= 0 ? '+' : ''}${netPnl.toFixed(2)} pUSD`;

  if (netPnl <= 0) {
    return {
      id: 1, name: 'Net PnL', numericValue: netPnl, formattedValue,
      threshold, verdict: 'NO-GO', reason: `Net PnL after fees/hedge/4.5% lockup (${formattedValue}) <= 0`,
    };
  }
  if (netPnl - maxClusterPnl <= 0) {
    return {
      id: 1, name: 'Net PnL', numericValue: netPnl, formattedValue,
      threshold, verdict: 'NO-GO', reason: 'Positive Net PnL comes solely from 1 isolated event cluster',
    };
  }

  const observations = buildWalkForwardObservations(perf);
  if (observations.length < MIN_RETURNS_FOR_WALK_FORWARD || perf.paperShadowDays < KPI_THRESHOLDS.MIN_PAPER_SHADOW_DAYS) {
    return {
      id: 1, name: 'Net PnL', numericValue: netPnl, formattedValue, threshold,
      verdict: 'NOT ENOUGH DATA',
      reason: `Window ${perf.paperShadowDays.toFixed(1)}d/${KPI_THRESHOLDS.MIN_PAPER_SHADOW_DAYS}d, returns=${observations.length}`,
    };
  }

  const wf = computeWalkForwardRobustness(observations, { nTrials: Math.max(1, perf.nTrials) });
  const ciLower = wf.pooled.overall.lower;
  return {
    id: 1, name: 'Net PnL', numericValue: netPnl, formattedValue, threshold,
    verdict: ciLower > 0 ? 'GO' : 'NO-GO',
    reason: `OOS 95% block-bootstrap mean return CI lower=${ciLower.toFixed(5)} (${ perf.paperShadowDays.toFixed(0)}d)`,
  };
}

export function evaluateSharpeSortinoKpi(perf: KpiEvaluationInput['performance']): KpiRowResult {
  const threshold = 'Sortino >= 2.0 & OOS Deflated Sharpe >= 1.5 (NO-GO DSR < 1.0)';
  const observations = buildWalkForwardObservations(perf);
  if (observations.length < MIN_RETURNS_FOR_WALK_FORWARD) {
    return {
      id: 2, name: 'Sharpe / Sortino', numericValue: null, formattedValue: 'NOT ENOUGH DATA',
      threshold, verdict: 'NOT ENOUGH DATA',
      reason: `Need >=${MIN_RETURNS_FOR_WALK_FORWARD} return steps for anchored WF OOS; got ${observations.length}`,
    };
  }
  const wf = computeWalkForwardRobustness(observations, { nTrials: Math.max(1, perf.nTrials) });
  const oosReturns = wf.folds.flatMap((fold) =>
    observations.slice(fold.fold.test.startIndex, fold.fold.test.endIndex).map((o) => o.returnValue),
  );
  const sortino = computeSortinoRatio(oosReturns, 0, perf.periodsPerYear);
  const dsr = wf.pooled.deflatedSharpe;
  const skew = computeSkewness(oosReturns);
  const kurt = computeKurtosis(oosReturns);
  const sr = dsr.observedSharpePerPeriod;
  const varFactor = Math.max(1e-9, 1 - skew * sr + ((kurt - 1) / 4) * sr * sr);
  const dsrAnnual =
    ((sr - dsr.expectedMaxSharpeUnderNull) / Math.sqrt(varFactor)) * Math.sqrt(perf.periodsPerYear);
  const formattedValue = `DSR ${dsrAnnual.toFixed(2)} | Sortino ${sortino.toFixed(2)}`;

  const verdict =
    dsrAnnual < KPI_THRESHOLDS.NOGO_DEFLATED_SHARPE_FLOOR
      ? 'NO-GO'
      : sortino >= KPI_THRESHOLDS.GO_SORTINO_MIN && dsrAnnual >= KPI_THRESHOLDS.GO_DEFLATED_SHARPE_MIN
        ? 'GO'
        : 'NO-GO';
  return {
    id: 2, name: 'Sharpe / Sortino', numericValue: dsrAnnual, formattedValue, threshold, verdict,
    reason: `Trials=${dsr.nTrials}, PSR=${(dsr.probability * 100).toFixed(1)}%, OOS n=${oosReturns.length}`,
  };
}

export function evaluateMaxDrawdownKpi(perf: KpiEvaluationInput['performance']): KpiRowResult {
  const threshold =
    perf.mode === 'pilot'
      ? 'Pilot < 2.5% MTM NAV (NO-GO >= 3.0% auto-halt)'
      : '90d Sim < 4.0% MTM NAV (Pilot hard cap < 2.5%)';
  if (perf.equityCurve.length < 2) {
    return {
      id: 3, name: 'Max Drawdown', numericValue: null, formattedValue: 'NOT ENOUGH DATA',
      threshold, verdict: 'NOT ENOUGH DATA', reason: 'Fewer than 2 MTM NAV observations',
    };
  }
  const ddPct = Math.abs(computeMaxDrawdown([...perf.equityCurve])) * 100;
  const formattedValue = `${ddPct.toFixed(2)}%`;
  if (perf.mode === 'pilot') {
    const verdict = ddPct < KPI_THRESHOLDS.GO_MAX_DRAWDOWN_PILOT_PCT ? 'GO' : 'NO-GO';
    return {
      id: 3, name: 'Max Drawdown', numericValue: ddPct, formattedValue, threshold, verdict,
      reason: ddPct >= KPI_THRESHOLDS.NOGO_MAX_DRAWDOWN_PILOT_PCT ? 'Breached 3.0% auto-halt' : 'Pilot MTM NAV curve',
    };
  }
  if (ddPct >= KPI_THRESHOLDS.GO_MAX_DRAWDOWN_SIM_PCT) {
    return {
      id: 3, name: 'Max Drawdown', numericValue: ddPct, formattedValue, threshold,
      verdict: 'NO-GO', reason: `Drawdown ${formattedValue} >= 4.0% sim ceiling`,
    };
  }
  if (perf.observationSpanDays < KPI_THRESHOLDS.MIN_SIM_DRAWDOWN_DAYS) {
    return {
      id: 3, name: 'Max Drawdown', numericValue: ddPct, formattedValue, threshold,
      verdict: 'NOT ENOUGH DATA',
      reason: `Span ${perf.observationSpanDays.toFixed(1)}d < ${KPI_THRESHOLDS.MIN_SIM_DRAWDOWN_DAYS}d sim horizon`,
    };
  }
  return {
    id: 3, name: 'Max Drawdown', numericValue: ddPct, formattedValue, threshold,
    verdict: 'GO', reason: `${perf.observationSpanDays.toFixed(0)}d MTM NAV drawdown within 4.0%`,
  };
}

export function evaluateProfitFactorKpi(perf: KpiEvaluationInput['performance']): KpiRowResult {
  const goTarget =
    perf.strategyClass === 'market-making'
      ? KPI_THRESHOLDS.GO_PROFIT_FACTOR_MM
      : KPI_THRESHOLDS.GO_PROFIT_FACTOR_EVENT;
  const threshold = `>= ${goTarget.toFixed(2)} (${perf.strategyClass}) | NO-GO < 1.15`;
  if (perf.closedCycles.length === 0) {
    return {
      id: 4, name: 'Profit Factor', numericValue: null, formattedValue: 'NOT ENOUGH DATA',
      threshold, verdict: 'NOT ENOUGH DATA', reason: '0 closed cycles',
    };
  }
  const pf = computeProfitFactor(perf.closedCycles.map((c) => ({ pnl: c.netPnlPusd })));
  const formattedValue = pf.toFixed(2);
  if (perf.closedCycles.length < KPI_THRESHOLDS.MIN_CLOSED_CYCLES_FOR_PF) {
    return {
      id: 4, name: 'Profit Factor', numericValue: pf, formattedValue, threshold,
      verdict: 'NOT ENOUGH DATA',
      reason: `Only ${perf.closedCycles.length}/${KPI_THRESHOLDS.MIN_CLOSED_CYCLES_FOR_PF} closed cycles`,
    };
  }
  return {
    id: 4, name: 'Profit Factor', numericValue: pf, formattedValue, threshold,
    verdict: pf >= goTarget ? 'GO' : 'NO-GO',
    reason: `${perf.closedCycles.length} closed net-of-fee cycles`,
  };
}
