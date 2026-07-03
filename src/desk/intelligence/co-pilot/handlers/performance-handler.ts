/**
 * Performance Handler
 * Gathers strategy performance data from PredictionAccuracyTracker
 * and strategy registry.
 */

import type { CopilotResponse } from '../response-formatter';
import { getAccuracyReport } from '../../../intelligence/prediction-accuracy-tracker';
import { BacktestRunner } from '../../../backtesting/backtest-runner';

export interface PerformanceData {
  winRate: number;
  totalPredictions: number;
  resolvedCount: number;
  topStrategies: string[];
  avgConfidenceCorrect: number;
  avgConfidenceIncorrect: number;
}

/**
 * Handle a strategy performance query.
 * Accepts optional injected dependencies for testing.
 */
export async function handlePerformanceQuery(
  context?: { page?: string; strategyId?: string },
  deps?: {
    backtestRunner?: BacktestRunner;
  },
): Promise<CopilotResponse> {
  const accuracyReport = getAccuracyReport();
  const backtestRunner = deps?.backtestRunner ?? new BacktestRunner();

  // Run a quick backtest for the top strategy if context provides one
  let backtestNote = '';
  if (context?.strategyId) {
    try {
      const result = await backtestRunner.run({
        strategy: context.strategyId,
        paperTrading: true,
        capitalUsdc: 5000,
        days: 30,
      });
      backtestNote = `\n- Backtest (${context.strategyId}): $${result ? result.metrics.totalPnl.toFixed(2) : 'N/A'} P&L, ${result?.metrics?.totalTrades ?? 0} trades`;
    } catch {
      backtestNote = '';
    }
  }

  // Top strategies by win rate
  const byStrategy = Object.entries(accuracyReport.byStrategy)
    .sort(([, a], [, b]) => b.winRate - a.winRate)
    .slice(0, 5);

  const answer = [
    '**Strategy Performance**',
    `- Win rate: ${(accuracyReport.winRate * 100).toFixed(1)}% (${accuracyReport.correct}/${accuracyReport.resolved} resolved)`,
    `- Pending: ${accuracyReport.pending} predictions`,
    `- Avg confidence (correct): ${(accuracyReport.avgConfidenceWhenCorrect * 100).toFixed(1)}%`,
    `- Avg confidence (incorrect): ${(accuracyReport.avgConfidenceWhenIncorrect * 100).toFixed(1)}%`,
    ...(backtestNote ? [backtestNote] : []),
    ...(byStrategy.length > 0 ? ['', '**Top Strategies by Win Rate:**'] : []),
    ...byStrategy.map(([name, s], i) =>
      `  ${i + 1}. ${name}: ${(s.winRate * 100).toFixed(1)}% (${s.correct}/${s.total})`,
    ),
  ].join('\n');

  return {
    answer,
    actions: [
      { label: 'View All Strategies', action: 'navigate', payload: '/strategies' },
      { label: 'Run Backtest', action: 'execute', payload: 'run_backtest' },
    ],
    sourceData: {
      winRate: accuracyReport.winRate,
      totalPredictions: accuracyReport.totalPredictions,
      resolvedCount: accuracyReport.resolved,
      topStrategies: byStrategy.map(([name]) => name),
      avgConfidenceCorrect: accuracyReport.avgConfidenceWhenCorrect,
      avgConfidenceIncorrect: accuracyReport.avgConfidenceWhenIncorrect,
    },
  };
}
