/**
 * Alpha Discover Handler — runs discovery pass evaluating all configs for a symbol.
 */
import { logger } from '../../shared/utils/logger';
import { loadAllConfigs, loadCandlesForConfig, writeOutput, printTable } from './alpha-helpers';
import { runExperiment } from '../../alpha-lab/experiments/experiment-engine';
import { runAllBaselines } from '../../alpha-lab/baselines/baseline-runner';

interface DiscoverResult {
  experimentId: string;
  symbol: string;
  sharpe: number;
  totalPnl: number;
  winRate: number;
  survivalGate: boolean;
  dataSource: string;
}

export async function handleDiscover(
  symbol: string,
  opts: { tf: string; json?: boolean; output?: string },
): Promise<void> {
  const configs = loadAllConfigs();
  if (configs.length === 0) {
    logger.info('No experiment configs found. Add configs to alpha-lab/configs/');
    return;
  }

  logger.info(`Discovering alpha for ${symbol} (${opts.tf})...`);
  const results: DiscoverResult[] = [];

  for (const config of configs) {
    if (config.symbol !== symbol || config.timeframe !== opts.tf) continue;

    try {
      const { candles, source } = await loadCandlesForConfig(config);
      const result = runExperiment({ candles, config });
      const baselines = runAllBaselines(
        candles,
        config.cost.feeBps,
        config.cost.slippageBps,
        config.seed,
      );

      const testMetrics = result.metrics.test;
      const bestBaselineSharpe = Math.max(
        ...baselines.map((b) => b.report.sharpeRatio),
      );
      const survivalGate =
        testMetrics.sharpeRatio > 0 &&
        testMetrics.winRate > 0.5 &&
        testMetrics.sharpeRatio > bestBaselineSharpe;

      results.push({
        experimentId: config.experimentId,
        symbol: config.symbol,
        sharpe: testMetrics.sharpeRatio,
        totalPnl: testMetrics.totalPnl,
        winRate: testMetrics.winRate,
        survivalGate,
        dataSource: source,
      });
    } catch (innerErr) {
      logger.warn(`Skipping ${config.experimentId}: ${(innerErr as Error).message}`);
    }
  }

  results.sort((a, b) => b.sharpe - a.sharpe);

  if (opts.json || opts.output) {
    writeOutput(results, opts.output, opts.json);
    return;
  }

  logger.info('');
  printTable(
    ['Experiment', 'Sharpe', 'Win%', 'PnL', 'Survival'],
    results.map((r) => [
      r.experimentId,
      r.sharpe.toFixed(2),
      (r.winRate * 100).toFixed(1) + '%',
      r.totalPnl.toFixed(4),
      r.survivalGate ? 'PASS' : '',
    ]),
  );
  logger.info('');
  logger.info(`Data source: ${results[0]?.dataSource ?? 'N/A'}`);
  logger.info('');
}
