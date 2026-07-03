/**
 * Report Handler
 * Gathers data from all other handlers to produce a comprehensive weekly report.
 */

import type { CopilotResponse } from '../response-formatter';
import { handleRiskQuery } from './risk-handler';
import { handleArbQuery } from './arb-handler';
import { handlePerformanceQuery } from './performance-handler';
import { handleRegimeQuery } from './regime-handler';
import { DrawdownMonitor } from '../../../risk/drawdown-monitor';
import { CircuitBreaker } from '../../../risk/circuit-breaker';
import { PositionManager } from '../../../risk/position-manager';
import { getAccuracyReport } from '../../../intelligence/prediction-accuracy-tracker';

/**
 * Handle a weekly report query.
 * Aggregates data from all other handlers.
 */
export async function handleReportQuery(
  context?: { page?: string; strategyId?: string },
): Promise<CopilotResponse> {
  // Gather data from all sources in parallel
  const [riskResult, arbResult, perfResult, regimeResult, metrics, circuitStatus, positions] = await Promise.all([
    handleRiskQuery(context).catch(() => null),
    handleArbQuery(context).catch(() => null),
    handlePerformanceQuery(context).catch(() => null),
    handleRegimeQuery(context).catch(() => null),
    new DrawdownMonitor().getMetrics().catch(() => null),
    new CircuitBreaker().getStatus().catch(() => null),
    new PositionManager().getAllPositions().catch((): [] => []),
  ]);

  const accuracy = getAccuracyReport();

  const answer = [
    '**Weekly Report**',
    `Generated: ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`,
    '',
    '---',
    '',
    '**1. Market Overview**',
    `- Regime: ${regimeResult?.sourceData?.regime ?? 'N/A'}`,
    `- Signal direction: ${regimeResult?.sourceData?.signalDirection ?? 'N/A'}`,
    '',
    '**2. Risk Summary**',
    `- Risk score: ${riskResult?.sourceData?.riskScore ?? 'N/A'}/10`,
    `- Drawdown: ${riskResult?.sourceData?.drawdown != null ? `${(riskResult.sourceData.drawdown as number).toFixed(2)}%` : 'N/A'}`,
    `- Circuit breaker: ${circuitStatus?.state ?? 'N/A'}`,
    '',
    '**3. Strategy Performance**',
    `- Win rate: ${(accuracy.winRate * 100).toFixed(1)}% (${accuracy.correct}/${accuracy.resolved})`,
    `- Pending predictions: ${accuracy.pending}`,
    '',
    '**4. Arbitrage Scan**',
    `- Spreads found: ${arbResult?.sourceData?.spreadsFound ?? 0}`,
    `- Cross-market: ${arbResult?.sourceData?.crossMarketBasket ? 'Yes' : 'No'}`,
    '',
    '**5. Portfolio**',
    `- Open positions: ${positions.length}`,
    `- Unrealized P&L: $${positions.reduce((sum, p) => sum + p.unrealizedPnl, 0).toFixed(2)}`,
  ].join('\n');

  return {
    answer,
    actions: [
      { label: 'Full Risk Report', action: 'navigate', payload: '/risk' },
      { label: 'Strategy Details', action: 'navigate', payload: '/strategies' },
      { label: 'Refresh Report', action: 'execute', payload: 'weekly_report' },
    ],
    sourceData: {
      regime: regimeResult?.sourceData?.regime,
      riskScore: riskResult?.sourceData?.riskScore,
      winRate: accuracy.winRate,
      openPositions: positions.length,
      spreadsFound: arbResult?.sourceData?.spreadsFound,
    },
  };
}
