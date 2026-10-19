/**
 * Pure gate threshold and check evaluation helpers for Paper-to-Live Gating.
 */

import type { GatingCriteriaConfig, PaperToLiveGateCheck, StrategyPaperProfile } from './live-trading-gating-types';

export interface QuantitativeMetrics {
  daysActive: number;
  totalTrades: number;
  winRate: number;
  profitFactor: number;
  maxDrawdown: number;
  sharpeRatio: number;
}

export function computeQuantitativeMetrics(profile: StrategyPaperProfile, currentTimeMs: number): QuantitativeMetrics {
  const elapsedMs = Math.max(0, currentTimeMs - profile.paperStartDate);
  const daysActive = elapsedMs / (1000 * 60 * 60 * 24);
  const totalTrades = profile.totalPaperTrades;
  const winRate = totalTrades > 0 ? profile.winningTrades / totalTrades : 0;
  const grossLoss = Math.abs(profile.grossLossUsd);
  const profitFactor = grossLoss > 0 ? profile.grossProfitUsd / grossLoss : profile.grossProfitUsd > 0 ? 999.0 : 0;
  return { daysActive, totalTrades, winRate, profitFactor, maxDrawdown: profile.maxDrawdown, sharpeRatio: profile.sharpeRatio };
}

function recordGateCheck(
  checks: PaperToLiveGateCheck[], rejectionReasons: string[], gate: string, threshold: string,
  actual: string | number | boolean, passed: boolean, failReason: string, rejectionReason = failReason,
): void {
  checks.push({ gate, threshold, actual, passed, reason: passed ? undefined : failReason });
  if (!passed) rejectionReasons.push(rejectionReason);
}

export function evaluateQuantitativeGateChecks(
  metrics: QuantitativeMetrics,
  config: GatingCriteriaConfig,
  checks: PaperToLiveGateCheck[],
  rejectionReasons: string[],
): void {
  const { daysActive, totalTrades, winRate, profitFactor, maxDrawdown, sharpeRatio } = metrics;

  recordGateCheck(
    checks, rejectionReasons,
    'Paper trading duration', `>= ${config.minDurationDays} calendar days`, `${daysActive.toFixed(1)} days`,
    daysActive >= config.minDurationDays,
    `Duration ${daysActive.toFixed(1)}d < required ${config.minDurationDays}d`,
    `Insufficient paper duration: ${daysActive.toFixed(1)}d < ${config.minDurationDays}d`,
  );

  recordGateCheck(
    checks, rejectionReasons,
    'Total paper trades', `>= ${config.minPaperTrades} trades`, totalTrades,
    totalTrades >= config.minPaperTrades,
    `Total trades ${totalTrades} < required ${config.minPaperTrades}`,
    `Insufficient paper trades: ${totalTrades} < ${config.minPaperTrades}`,
  );

  const wrPct = (winRate * 100).toFixed(1);
  const minWrPct = (config.minWinRate * 100).toFixed(0);
  recordGateCheck(
    checks, rejectionReasons,
    'Win rate', `>= ${minWrPct}%`, `${wrPct}%`,
    winRate >= config.minWinRate,
    `Win rate ${wrPct}% < required ${minWrPct}%`,
    `Win rate below threshold: ${wrPct}% < ${minWrPct}%`,
  );

  recordGateCheck(
    checks, rejectionReasons,
    'Profit factor', `>= ${config.minProfitFactor}`, profitFactor.toFixed(2),
    profitFactor >= config.minProfitFactor,
    `Profit factor ${profitFactor.toFixed(2)} < required ${config.minProfitFactor}`,
    `Profit factor below threshold: ${profitFactor.toFixed(2)} < ${config.minProfitFactor}`,
  );

  const ddPct = (maxDrawdown * 100).toFixed(1);
  const maxDdPct = (config.maxDrawdown * 100).toFixed(0);
  recordGateCheck(
    checks, rejectionReasons,
    'Max drawdown', `≤ ${maxDdPct}%`, `${ddPct}%`,
    maxDrawdown <= config.maxDrawdown,
    `Max drawdown ${ddPct}% exceeds ${maxDdPct}%`,
    `Drawdown breach: ${ddPct}% > ${maxDdPct}%`,
  );

  recordGateCheck(
    checks, rejectionReasons,
    'Sharpe ratio', `>= ${config.minSharpeRatio}`, sharpeRatio.toFixed(2),
    sharpeRatio >= config.minSharpeRatio,
    `Sharpe ratio ${sharpeRatio.toFixed(2)} < required ${config.minSharpeRatio}`,
    `Sharpe ratio below threshold: ${sharpeRatio.toFixed(2)} < ${config.minSharpeRatio}`,
  );
}

export function evaluateOperationalGateChecks(
  profile: StrategyPaperProfile,
  config: GatingCriteriaConfig,
  checks: PaperToLiveGateCheck[],
  rejectionReasons: string[],
): void {
  const oosPass = profile.valWinRate === undefined || profile.testWinRate === undefined
    ? true
    : profile.testWinRate >= profile.valWinRate - config.maxOosDegradation;
  recordGateCheck(
    checks, rejectionReasons,
    'Out-of-sample consistency', `testWinRate > valWinRate - ${(config.maxOosDegradation * 100).toFixed(0)}%`,
    oosPass ? 'Consistent' : 'Degraded', oosPass,
    'Out-of-sample degradation detected', 'Out-of-sample consistency check failed',
  );

  const kellyPass = profile.regimeKellyWired ?? true;
  recordGateCheck(
    checks, rejectionReasons,
    'Regime-aware Kelly wired', 'Yes', kellyPass ? 'Yes' : 'No', kellyPass,
    'Regime-aware Kelly position sizer not wired',
  );

  const cbPass = profile.circuitBreakerTested ?? true;
  recordGateCheck(
    checks, rejectionReasons,
    'Circuit breaker tested', 'Yes', cbPass ? 'Yes' : 'No', cbPass,
    'Circuit breaker not tested',
  );

  const connPass = profile.exchangeConnected ?? true;
  recordGateCheck(
    checks, rejectionReasons,
    'Exchange connectivity', 'All targets green', connPass ? 'Connected' : 'Disconnected', connPass,
    'Exchange connectivity failed',
  );
}
