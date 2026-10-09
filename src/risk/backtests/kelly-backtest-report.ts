/**
 * Reporting for the Kelly vs Fixed backtest.
 *
 * Prints the scenario comparison + improvement tables to stdout and writes
 * the detailed results file. Extracted from kelly-vs-fixed.backtest.ts with
 * zero behavior change.
 */

import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { logger } from '../../shared/utils/logger';
import type { ScenarioResult } from './kelly-backtest-simulation';
import type { BacktestParams } from './kelly-backtest-scenarios';
import {
  formatComparisonTable,
  formatImprovementTable,
  generateReportFileContent,
} from './kelly-backtest-formatter';

/**
 * Print comparison/improvement tables and summary, then persist detailed
 * results. Returns the output path of the written results file.
 */
export async function printReportAndSaveResults(
  results: ScenarioResult[],
  params: BacktestParams
): Promise<string> {
  const baseMetrics = results[0].metrics;

  for (const line of formatComparisonTable(results)) {
    logger.info(line);
  }
  logger.info('');

  for (const line of formatImprovementTable(results)) {
    logger.info(line);
  }
  logger.info('');

  const bestSharpeScenario = results
    .slice(1)
    .reduce((best, curr) => (curr.metrics.sharpe > best.metrics.sharpe ? curr : best));
  const sharpeImprovement =
    ((bestSharpeScenario.metrics.sharpe - baseMetrics.sharpe) / Math.abs(baseMetrics.sharpe)) * 100;

  logger.info('SUMMARY:');
  logger.info(`- Initial bankroll: $${params.initialBankroll.toLocaleString()}`);
  logger.info(`- Trades simulated: ${params.numTrades}`);
  logger.info(`- Win probability: ${(params.winProbability * 100).toFixed(1)}%`);
  logger.info(`- Win/loss ratio: ${params.winLossRatio}:1`);
  logger.info(`- Kelly fraction: ${params.kellyFraction} (quarter-Kelly)`);
  logger.info(`- Max position cap: ${params.maxPositionFraction * 100}%`);
  logger.info('');
  logger.info(`Target: Sharpe improvement ≥20%`);
  logger.info(`Achieved: ${sharpeImprovement.toFixed(1)}% improvement with ${bestSharpeScenario.name}`);
  logger.info(`Status: ${sharpeImprovement >= 20 ? '✓ PASS' : '✗ FAIL'}`);
  logger.info('');

  const outputDir = '/Users/macbook/algo-trader/plans/20260617-1430-differentiation-quick-wins';
  const outputPath = join(outputDir, 'backtest-kelly-results.txt');
  const timestamp = new Date().toISOString();
  const outputContent = generateReportFileContent(
    results,
    params,
    timestamp,
    sharpeImprovement,
    bestSharpeScenario
  );

  await mkdir(outputDir, { recursive: true });
  await writeFile(outputPath, outputContent);

  logger.info(`Detailed results saved to: ${outputPath}`);
  logger.info('');

  return outputPath;
}
