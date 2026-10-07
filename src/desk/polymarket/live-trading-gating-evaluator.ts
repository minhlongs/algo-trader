/**
 * Live Trading Paper-to-Live Gating Evaluator
 *
 * Evaluates candidate strategies against canonical 10-gate criteria from docs/transition-criteria.md.
 */

import {
  type StrategyPaperProfile,
  type PaperToLiveEvaluationResult,
  type PaperToLiveGateCheck,
  type GatingCriteriaConfig,
  type StrategyTradingTier,
  DEFAULT_GATING_CONFIG,
} from './live-trading-gating-types';

export function evaluatePaperToLiveGating(
  profile: StrategyPaperProfile,
  config: GatingCriteriaConfig = DEFAULT_GATING_CONFIG,
  currentTimeMs = Date.now(),
): PaperToLiveEvaluationResult {
  const elapsedMs = Math.max(0, currentTimeMs - profile.paperStartDate);
  const daysActive = elapsedMs / (1000 * 60 * 60 * 24);
  const totalTrades = profile.totalPaperTrades;
  const winRate = totalTrades > 0 ? profile.winningTrades / totalTrades : 0;
  const grossLoss = Math.abs(profile.grossLossUsd);
  const profitFactor = grossLoss > 0 ? profile.grossProfitUsd / grossLoss : profile.grossProfitUsd > 0 ? 999.0 : 0;
  const maxDrawdown = profile.maxDrawdown;
  const sharpeRatio = profile.sharpeRatio;

  const checks: PaperToLiveGateCheck[] = [];
  const rejectionReasons: string[] = [];

  // Gate 1: Duration >= 30 days
  const durationPass = daysActive >= config.minDurationDays;
  checks.push({
    gate: 'Paper trading duration',
    threshold: `>= ${config.minDurationDays} calendar days`,
    actual: `${daysActive.toFixed(1)} days`,
    passed: durationPass,
    reason: durationPass ? undefined : `Duration ${daysActive.toFixed(1)}d < required ${config.minDurationDays}d`,
  });
  if (!durationPass) rejectionReasons.push(`Insufficient paper duration: ${daysActive.toFixed(1)}d < ${config.minDurationDays}d`);

  // Gate 2: Paper trades >= 50
  const tradesPass = totalTrades >= config.minPaperTrades;
  checks.push({
    gate: 'Total paper trades',
    threshold: `>= ${config.minPaperTrades} trades`,
    actual: totalTrades,
    passed: tradesPass,
    reason: tradesPass ? undefined : `Total trades ${totalTrades} < required ${config.minPaperTrades}`,
  });
  if (!tradesPass) rejectionReasons.push(`Insufficient paper trades: ${totalTrades} < ${config.minPaperTrades}`);

  // Gate 3: Win rate >= 55%
  const winRatePass = winRate >= config.minWinRate;
  checks.push({
    gate: 'Win rate',
    threshold: `>= ${(config.minWinRate * 100).toFixed(0)}%`,
    actual: `${(winRate * 100).toFixed(1)}%`,
    passed: winRatePass,
    reason: winRatePass ? undefined : `Win rate ${(winRate * 100).toFixed(1)}% < required ${(config.minWinRate * 100).toFixed(0)}%`,
  });
  if (!winRatePass) rejectionReasons.push(`Win rate below threshold: ${(winRate * 100).toFixed(1)}% < ${(config.minWinRate * 100).toFixed(0)}%`);

  // Gate 4: Profit factor >= 1.3
  const pfPass = profitFactor >= config.minProfitFactor;
  checks.push({
    gate: 'Profit factor',
    threshold: `>= ${config.minProfitFactor}`,
    actual: profitFactor.toFixed(2),
    passed: pfPass,
    reason: pfPass ? undefined : `Profit factor ${profitFactor.toFixed(2)} < required ${config.minProfitFactor}`,
  });
  if (!pfPass) rejectionReasons.push(`Profit factor below threshold: ${profitFactor.toFixed(2)} < ${config.minProfitFactor}`);

  // Gate 5: Max drawdown <= 15%
  const ddPass = maxDrawdown <= config.maxDrawdown;
  checks.push({
    gate: 'Max drawdown',
    threshold: `≤ ${(config.maxDrawdown * 100).toFixed(0)}%`,
    actual: `${(maxDrawdown * 100).toFixed(1)}%`,
    passed: ddPass,
    reason: ddPass ? undefined : `Max drawdown ${(maxDrawdown * 100).toFixed(1)}% exceeds ${(config.maxDrawdown * 100).toFixed(0)}%`,
  });
  if (!ddPass) rejectionReasons.push(`Drawdown breach: ${(maxDrawdown * 100).toFixed(1)}% > ${(config.maxDrawdown * 100).toFixed(0)}%`);

  // Gate 6: Sharpe ratio >= 1.0
  const sharpePass = sharpeRatio >= config.minSharpeRatio;
  checks.push({
    gate: 'Sharpe ratio',
    threshold: `>= ${config.minSharpeRatio}`,
    actual: sharpeRatio.toFixed(2),
    passed: sharpePass,
    reason: sharpePass ? undefined : `Sharpe ratio ${sharpeRatio.toFixed(2)} < required ${config.minSharpeRatio}`,
  });
  if (!sharpePass) rejectionReasons.push(`Sharpe ratio below threshold: ${sharpeRatio.toFixed(2)} < ${config.minSharpeRatio}`);

  // Gate 7: Out-of-sample consistency
  const oosPass = profile.valWinRate === undefined || profile.testWinRate === undefined
    ? true
    : profile.testWinRate >= profile.valWinRate - config.maxOosDegradation;
  checks.push({
    gate: 'Out-of-sample consistency',
    threshold: `testWinRate > valWinRate - ${(config.maxOosDegradation * 100).toFixed(0)}%`,
    actual: oosPass ? 'Consistent' : 'Degraded',
    passed: oosPass,
    reason: oosPass ? undefined : 'Out-of-sample degradation detected',
  });
  if (!oosPass) rejectionReasons.push('Out-of-sample consistency check failed');

  // Gate 8: Regime-aware Kelly wired
  const kellyPass = profile.regimeKellyWired ?? true;
  checks.push({
    gate: 'Regime-aware Kelly wired',
    threshold: 'Yes',
    actual: kellyPass ? 'Yes' : 'No',
    passed: kellyPass,
    reason: kellyPass ? undefined : 'Regime-aware Kelly position sizer not wired',
  });
  if (!kellyPass) rejectionReasons.push('Regime-aware Kelly position sizer not wired');

  // Gate 9: Circuit breaker tested
  const cbPass = profile.circuitBreakerTested ?? true;
  checks.push({
    gate: 'Circuit breaker tested',
    threshold: 'Yes',
    actual: cbPass ? 'Yes' : 'No',
    passed: cbPass,
    reason: cbPass ? undefined : 'Circuit breaker not tested',
  });
  if (!cbPass) rejectionReasons.push('Circuit breaker not tested');

  // Gate 10: Exchange connectivity
  const connPass = profile.exchangeConnected ?? true;
  checks.push({
    gate: 'Exchange connectivity',
    threshold: 'All targets green',
    actual: connPass ? 'Connected' : 'Disconnected',
    passed: connPass,
    reason: connPass ? undefined : 'Exchange connectivity failed',
  });
  if (!connPass) rejectionReasons.push('Exchange connectivity failed');

  const eligible = checks.every((c) => c.passed);
  let recommendedTier: StrategyTradingTier = 'TIER_1_PAPER';
  if (eligible) {
    recommendedTier = 'TIER_2_SHADOW';
  }

  return {
    eligible,
    strategyKey: profile.strategyKey,
    daysActive,
    totalTrades,
    winRate,
    profitFactor,
    maxDrawdown,
    sharpeRatio,
    checks,
    rejectionReasons,
    recommendedTier,
  };
}
