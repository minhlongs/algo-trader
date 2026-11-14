/**
 * Evaluators for Governance KPIs 6–11 (Adverse Selection, Calibration,
 * Capital Utilization, Turnover & Cost Stress, Capacity, Tail Loss & Settlement)
 * — Architecture Report pp. 61–62.
 */

import {
  KPI_THRESHOLDS,
  type KpiCalibrationSample,
  type KpiEvaluationInput,
  type KpiRowResult,
} from './kpi-poly-types';

function computeExpectedCalibrationError(samples: readonly KpiCalibrationSample[], bins = 10): number {
  if (samples.length === 0) return 0;
  let ece = 0;
  for (let b = 0; b < bins; b++) {
    const lo = b / bins;
    const hi = (b + 1) / bins;
    const bucket = samples.filter((s) =>
      b === bins - 1 ? s.modelProb >= lo && s.modelProb <= hi : s.modelProb >= lo && s.modelProb < hi,
    );
    if (bucket.length === 0) continue;
    const avgProb = bucket.reduce((acc, s) => acc + s.modelProb, 0) / bucket.length;
    const avgOut = bucket.reduce((acc, s) => acc + s.outcome, 0) / bucket.length;
    ece += (bucket.length / samples.length) * Math.abs(avgProb - avgOut);
  }
  return ece;
}

export function evaluateAdverseSelectionKpi(
  adv: KpiEvaluationInput['adverseSelection'],
): KpiRowResult {
  const threshold = 'Mean 60s Realized Spread + Rebate + Reward >= +15 bps (NO-GO < 0 bps)';
  if (adv.markouts.length === 0) {
    return {
      id: 6, name: 'Adverse Selection', numericValue: null, formattedValue: 'NOT ENOUGH DATA',
      threshold, verdict: 'NOT ENOUGH DATA', reason: '0 maker fills with 60s post-fill markout',
    };
  }
  const netEdgesBps = adv.markouts.map((m) => {
    const isBuy = m.side === 'buy' || m.side === 'yes';
    const signedMove = isBuy ? m.midAt60s - m.fillPrice : m.fillPrice - m.midAt60s;
    return signedMove * 10_000 + m.makerRebateBps + m.liquidityRewardBps;
  });
  const meanBps = netEdgesBps.reduce((acc, v) => acc + v, 0) / netEdgesBps.length;
  const formattedValue = `${meanBps >= 0 ? '+' : ''}${meanBps.toFixed(1)} bps`;

  if (adv.markouts.length < KPI_THRESHOLDS.MIN_MAKER_MARKOUT_SAMPLES) {
    return {
      id: 6, name: 'Adverse Selection', numericValue: meanBps, formattedValue, threshold,
      verdict: 'NOT ENOUGH DATA',
      reason: `Only ${adv.markouts.length}/${KPI_THRESHOLDS.MIN_MAKER_MARKOUT_SAMPLES} 60s markout fills`,
    };
  }
  return {
    id: 6, name: 'Adverse Selection', numericValue: meanBps, formattedValue, threshold,
    verdict: meanBps >= KPI_THRESHOLDS.GO_REALIZED_SPREAD_60S_NET_BPS ? 'GO' : 'NO-GO',
    reason: meanBps < KPI_THRESHOLDS.NOGO_REALIZED_SPREAD_60S_FLOOR_BPS
      ? 'Negative net 60s markout after rebate + reward'
      : `${adv.markouts.length} maker fills evaluated at 60s horizon`,
  };
}

export function evaluateBrierCalibrationKpi(
  cal: KpiEvaluationInput['calibration'],
): KpiRowResult {
  const threshold = 'BSS_OOS >= +0.02 & ECE < 0.035 (NO-GO BSS_OOS <= 0)';
  if (cal.forecasts.length < KPI_THRESHOLDS.MIN_CALIBRATION_FORECASTS) {
    return {
      id: 7, name: 'Brier Score / Log Loss', numericValue: null, formattedValue: 'NOT ENOUGH DATA',
      threshold, verdict: 'NOT ENOUGH DATA',
      reason: `Resolved OOS forecasts=${cal.forecasts.length}/${KPI_THRESHOLDS.MIN_CALIBRATION_FORECASTS}`,
    };
  }
  const n = cal.forecasts.length;
  const brierModel = cal.forecasts.reduce((s, f) => s + (f.modelProb - f.outcome) ** 2, 0) / n;
  const brierMkt = cal.forecasts.reduce((s, f) => s + (f.marketProb - f.outcome) ** 2, 0) / n;
  const logLoss =
    -cal.forecasts.reduce((s, f) => {
      const p = Math.min(1 - 1e-9, Math.max(1e-9, f.modelProb));
      return s + (f.outcome === 1 ? Math.log(p) : Math.log(1 - p));
    }, 0) / n;
  const bss = brierMkt > 1e-12 ? 1 - brierModel / brierMkt : 0;
  const ece = computeExpectedCalibrationError(cal.forecasts);
  const formattedValue = `BSS=${bss >= 0 ? '+' : ''}${bss.toFixed(4)} ECE=${ece.toFixed(4)}`;
  const verdict =
    bss <= KPI_THRESHOLDS.NOGO_BSS_OOS_FLOOR
      ? 'NO-GO'
      : bss >= KPI_THRESHOLDS.GO_BSS_OOS_MIN && ece < KPI_THRESHOLDS.GO_ECE_MAX
        ? 'GO'
        : 'NO-GO';
  return {
    id: 7, name: 'Brier Score / Log Loss', numericValue: bss, formattedValue, threshold, verdict,
    reason: `Brier=${brierModel.toFixed(4)} vs mkt=${brierMkt.toFixed(4)}, LogLoss=${logLoss.toFixed(4)}`,
  };
}

export function evaluateCapitalUtilizationKpi(
  cap: KpiEvaluationInput['capital'],
): KpiRowResult {
  const threshold = 'Avg lockup < 10d & awaiting-res < 25% (NO-GO > 40% locked > 30d)';
  if (cap.lockedOver30dPct !== null && cap.lockedOver30dPct > KPI_THRESHOLDS.NOGO_LONG_DATED_LOCKED_MAX_PCT) {
    return {
      id: 8, name: 'Capital Utilization', numericValue: cap.lockedOver30dPct,
      formattedValue: `${cap.lockedOver30dPct.toFixed(1)}% >30d`, threshold, verdict: 'NO-GO',
      reason: 'More than 40% of capital locked in contracts >30d to expiry',
    };
  }
  if (cap.weightedAvgLockupDays === null || cap.awaitingResolutionPct === null || cap.lockedOver30dPct === null) {
    return {
      id: 8, name: 'Capital Utilization', numericValue: null, formattedValue: 'NOT ENOUGH DATA',
      threshold, verdict: 'NOT ENOUGH DATA', reason: 'No active capital lockup schedule observed',
    };
  }
  const ok =
    cap.weightedAvgLockupDays < KPI_THRESHOLDS.GO_AVG_LOCKUP_MAX_DAYS &&
    cap.awaitingResolutionPct < KPI_THRESHOLDS.GO_LOCKED_CAPITAL_MAX_PCT;
  return {
    id: 8, name: 'Capital Utilization', numericValue: cap.weightedAvgLockupDays,
    formattedValue: `${cap.weightedAvgLockupDays.toFixed(1)}d | wait=${cap.awaitingResolutionPct.toFixed(1)}%`,
    threshold, verdict: ok ? 'GO' : 'NO-GO', reason: `>30d locked=${cap.lockedOver30dPct.toFixed(1)}%`,
  };
}

export function evaluateCostStressKpi(stress: KpiEvaluationInput['stress']): KpiRowResult {
  const threshold = 'Net PnL > 0 at 1.5x slippage/cancel-latency & +0.5c shock (NO-GO <= 0)';
  if (
    stress.baselineNetPnlPusd === null ||
    stress.stressed15xNetPnlPusd === null ||
    stress.plusHalfCentSlippageNetPnlPusd === null
  ) {
    return {
      id: 9, name: 'Turnover & Cost Stress', numericValue: null, formattedValue: 'NOT ENOUGH DATA',
      threshold, verdict: 'NOT ENOUGH DATA', reason: 'No filled trades to stress-test at 1.5x cost/latency',
    };
  }
  const worst = Math.min(stress.stressed15xNetPnlPusd, stress.plusHalfCentSlippageNetPnlPusd);
  const formattedValue = `1.5x=${stress.stressed15xNetPnlPusd.toFixed(2)} | +0.5c=${stress.plusHalfCentSlippageNetPnlPusd.toFixed(2)} pUSD`;
  return {
    id: 9, name: 'Turnover & Cost Stress', numericValue: worst, formattedValue, threshold,
    verdict: worst > 0 ? 'GO' : 'NO-GO',
    reason: `Baseline=${stress.baselineNetPnlPusd.toFixed(2)} pUSD`,
  };
}

export function evaluateCapacityKpi(cap: KpiEvaluationInput['capacity']): KpiRowResult {
  const threshold = '>= 25,000 pUSD before >35% margin decay (NO-GO < 3,000 pUSD)';
  if (cap.deployableCapacityPusd === null) {
    return {
      id: 10, name: 'Capacity', numericValue: null, formattedValue: 'NOT ENOUGH DATA',
      threshold, verdict: 'NOT ENOUGH DATA', reason: 'Insufficient L2 book depth samples to estimate ceiling',
    };
  }
  const v = cap.deployableCapacityPusd;
  const formattedValue = `${v.toFixed(0)} pUSD`;
  const verdict = v >= KPI_THRESHOLDS.GO_CAPACITY_MIN_PUSD ? 'GO' : 'NO-GO';
  return {
    id: 10, name: 'Capacity', numericValue: v, formattedValue, threshold, verdict,
    reason: v < KPI_THRESHOLDS.NOGO_CAPACITY_FLOOR_PUSD ? 'Below 3,000 pUSD floor' : 'Estimated from observed CLOB depth',
  };
}

export function evaluateTailSettlementKpi(
  tail: KpiEvaluationInput['tailAndSettlement'],
): KpiRowResult {
  const threshold = 'Cluster 99%-CVaR < 3.0% NAV, 0 Ghost Fills, <=1 token diff (NO-GO breach)';
  const worstClusterLoss =
    tail.eventClusterLossPctNav.length > 0 ? Math.max(...tail.eventClusterLossPctNav) : null;
  if (
    (worstClusterLoss !== null && worstClusterLoss >= KPI_THRESHOLDS.GO_CLUSTER_LOSS_MAX_NAV_PCT) ||
    (tail.undetectedGhostFills !== null && tail.undetectedGhostFills > 0) ||
    (tail.maxUnexplainedTokenDiscrepancy !== null &&
      tail.maxUnexplainedTokenDiscrepancy > KPI_THRESHOLDS.MAX_UNEXPLAINED_TOKEN_DISCREPANCY)
  ) {
    return {
      id: 11, name: 'Tail Loss & Settlement', numericValue: worstClusterLoss ?? tail.maxUnexplainedTokenDiscrepancy,
      formattedValue: `clusterLoss=${worstClusterLoss?.toFixed(2) ?? 'n/a'}% ghost=${tail.undetectedGhostFills ?? 'n/a'}`,
      threshold, verdict: 'NO-GO', reason: 'Tail cluster loss >=3% NAV, ghost fill, or >1 token discrepancy',
    };
  }
  if (
    !tail.onChainReconciled ||
    worstClusterLoss === null ||
    tail.undetectedGhostFills === null ||
    tail.maxUnexplainedTokenDiscrepancy === null
  ) {
    const fmt = worstClusterLoss !== null ? `paperClusterLoss=${worstClusterLoss.toFixed(2)}%` : 'NOT ENOUGH DATA';
    return {
      id: 11, name: 'Tail Loss & Settlement', numericValue: worstClusterLoss, formattedValue: fmt,
      threshold, verdict: 'NOT ENOUGH DATA',
      reason: 'On-chain CTF position / UMA settlement reconciliation not yet observed in live mode',
    };
  }
  return {
    id: 11, name: 'Tail Loss & Settlement', numericValue: worstClusterLoss,
    formattedValue: `clusterLoss=${worstClusterLoss.toFixed(2)}% ghost=0`, threshold, verdict: 'GO',
    reason: `Max token diff=${tail.maxUnexplainedTokenDiscrepancy.toFixed(2)}`,
  };
}
