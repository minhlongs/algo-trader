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
import {
  computeQuantitativeMetrics,
  evaluateOperationalGateChecks,
  evaluateQuantitativeGateChecks,
  type QuantitativeMetrics,
} from './live-trading-gating-checks';

export {
  computeQuantitativeMetrics,
  evaluateOperationalGateChecks,
  evaluateQuantitativeGateChecks,
  type QuantitativeMetrics,
} from './live-trading-gating-checks';

export function evaluatePaperToLiveGating(
  profile: StrategyPaperProfile,
  config: GatingCriteriaConfig = DEFAULT_GATING_CONFIG,
  currentTimeMs = Date.now(),
): PaperToLiveEvaluationResult {
  const metrics = computeQuantitativeMetrics(profile, currentTimeMs);
  const checks: PaperToLiveGateCheck[] = [];
  const rejectionReasons: string[] = [];

  evaluateQuantitativeGateChecks(metrics, config, checks, rejectionReasons);
  evaluateOperationalGateChecks(profile, config, checks, rejectionReasons);

  const eligible = checks.every((c) => c.passed);
  const recommendedTier: StrategyTradingTier = eligible ? 'TIER_2_SHADOW' : 'TIER_1_PAPER';

  return {
    eligible,
    strategyKey: profile.strategyKey,
    daysActive: metrics.daysActive,
    totalTrades: metrics.totalTrades,
    winRate: metrics.winRate,
    profitFactor: metrics.profitFactor,
    maxDrawdown: metrics.maxDrawdown,
    sharpeRatio: metrics.sharpeRatio,
    checks,
    rejectionReasons,
    recommendedTier,
  };
}
