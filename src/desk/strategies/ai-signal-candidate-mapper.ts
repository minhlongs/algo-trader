/**
 * Alpha Candidate to AISignal Mapper
 */

import type { MarketRegime } from '../../alpha-lab/regimes/regime-types';
import type { DiscoveredAlphaCandidate } from '../../alpha-lab/alpha-discovery/continuous-discovery-types';
import type { AISignal } from './ai-signal-adapter-types';

export function candidateToAISignal(
  candidate: DiscoveredAlphaCandidate,
  regime: MarketRegime,
  direction: 'BUY' | 'SELL',
  symbol?: string,
): AISignal {
  const resolvedSymbol = symbol ?? candidate.config?.symbol ?? 'BTC/USDT';

  const rawConfidence =
    candidate.walkforwardSummary?.testWinRate ??
    candidate.walkforwardResult?.summary?.testWinRate ??
    0;
  const confidence =
    typeof rawConfidence === 'number' && Number.isFinite(rawConfidence) && rawConfidence >= 0 && rawConfidence <= 1
      ? rawConfidence
      : 0;

  let rawExpectancy = 0;
  const steps = candidate.walkforwardResult?.steps;
  if (steps && steps.length > 0) {
    const validSteps = steps.filter(
      (s) => s.testMetrics && typeof s.testMetrics.meanLabel === 'number' && Number.isFinite(s.testMetrics.meanLabel),
    );
    if (validSteps.length > 0) {
      rawExpectancy =
        validSteps.reduce((sum, s) => sum + s.testMetrics.meanLabel, 0) /
        validSteps.length;
    }
  } else if (candidate.walkforwardSummary) {
    const { totalTestTrades, testTotalPnl } = candidate.walkforwardSummary;
    if (typeof totalTestTrades === 'number' && totalTestTrades > 0 && typeof testTotalPnl === 'number') {
      rawExpectancy = testTotalPnl / totalTestTrades;
    }
  }

  const expectancy = Number.isFinite(rawExpectancy) ? rawExpectancy : 0;

  // Calibrated confidence: Bayesian Laplace smoothing based on sample size and regime consistency
  const totalTrades = candidate.walkforwardSummary?.totalTestTrades ?? 0;
  const wins = Math.round(confidence * totalTrades);
  const bayesianConfidence = totalTrades > 0
    ? (wins + 2) / (totalTrades + 4)
    : confidence;
  const gateMetrics = candidate.survivalGateResult as { metrics?: { regimeConsistencyScore?: number } } | undefined;
  const regimeScore = gateMetrics?.metrics?.regimeConsistencyScore;
  const calibratedConfidence = typeof regimeScore === 'number' && Number.isFinite(regimeScore)
    ? Math.min(1, Math.max(0, bayesianConfidence * (0.8 + 0.2 * regimeScore)))
    : bayesianConfidence;

  // Expected holding period in bars/hours
  const candidateConfig = candidate.config as unknown as Record<string, unknown> | undefined;
  const configParams = (candidateConfig?.parameters ?? {}) as Record<string, unknown>;
  const rawHoldingPeriod =
    candidateConfig?.maxHolding ??
    candidate.params?.maxHolding ??
    configParams?.maxHolding ??
    candidate.params?.holdingPeriod ??
    configParams?.holdingPeriod ??
    candidateConfig?.lookback ??
    configParams?.lookback ??
    candidate.params?.lookback ??
    24;
  const expectedHoldingPeriod =
    typeof rawHoldingPeriod === 'number' && Number.isFinite(rawHoldingPeriod) && rawHoldingPeriod > 0
      ? rawHoldingPeriod
      : 24;

  const now = Date.now();

  return {
    strategyId: candidate.strategyId,
    signalId: `sig-${candidate.strategyId}-${now}`,
    direction,
    action: direction,
    symbol: resolvedSymbol,
    confidence,
    calibratedConfidence,
    expectedHoldingPeriod,
    expectancy,
    regime,
    timestamp: now,
  };
}
