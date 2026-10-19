/**
 * Wave 236: Almgren, Thum, Hauptmann & Li (2005) Empirical Impact Math
 * Perm: I_perm = gamma * sigma * (X / V) * (N / V)^0.25 (scaled in bps)
 * Temp: I_temp = eta * sigma * (X / (V * T))^alpha
 */

import { AlmgrenEmpiricalConfig, EmpiricalOrderExecution, EmpiricalImpactCostAssessment } from './almgren-types';

export function estimatePermanentImpactBps(
  order: EmpiricalOrderExecution,
  config: AlmgrenEmpiricalConfig
): number {
  if (config.averageDailyVolumeV <= 0) return 0;
  const relativeSize = order.totalSharesX / config.averageDailyVolumeV;
  const turnoverRatio = config.sharesOutstandingN / config.averageDailyVolumeV;
  const turnoverFactor = Math.pow(Math.max(1, turnoverRatio), 0.25);
  // bps = 10,000 * impact
  return 10_000 * config.permanentFactorGamma * config.dailyVolatilitySigma * relativeSize * turnoverFactor;
}

export function estimateTemporaryImpactBps(
  order: EmpiricalOrderExecution,
  config: AlmgrenEmpiricalConfig
): number {
  if (config.averageDailyVolumeV <= 0 || order.durationDaysT <= 0) return 0;
  const dailyRate = order.totalSharesX / (config.averageDailyVolumeV * order.durationDaysT);
  return (
    10_000 *
    config.temporaryFactorEta *
    config.dailyVolatilitySigma *
    Math.pow(dailyRate, config.temporaryExponentAlpha)
  );
}

export function evaluateEmpiricalExecution(
  order: EmpiricalOrderExecution,
  config: AlmgrenEmpiricalConfig
): EmpiricalImpactCostAssessment {
  const permBps = estimatePermanentImpactBps(order, config);
  const tempBps = estimateTemporaryImpactBps(order, config);
  // Average implementation shortfall: 0.5 * perm + temp
  const totalBps = 0.5 * permBps + tempBps;
  const partRate = order.totalSharesX / (config.averageDailyVolumeV * order.durationDaysT);

  return {
    permanentPriceImpactBps: permBps,
    temporaryPriceImpactBps: tempBps,
    totalExecutionShortfallBps: totalBps,
    participationRate: partRate,
  };
}
