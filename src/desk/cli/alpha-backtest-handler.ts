/**
 * Alpha Backtest Handler — runs a single experiment and shows result metrics.
 */
import { logger } from '../../shared/utils/logger';
import { loadConfigByName, loadCandlesForConfig, writeOutput, printTable } from './alpha-helpers';
import { runExperiment } from '../../alpha-lab/experiments/experiment-engine';
import { runAllBaselines } from '../../alpha-lab/baselines/baseline-runner';

export async function handleBacktest(
  experiment: string,
  opts: { json?: boolean; output?: string },
): Promise<void> {
  const config = loadConfigByName(experiment);
  const { candles, source } = await loadCandlesForConfig(config);
  const result = runExperiment({ candles, config });
  const baselines = runAllBaselines(
    candles,
    config.cost.feeBps,
    config.cost.slippageBps,
    config.seed,
  );

  const output = {
    experimentId: config.experimentId,
    symbol: config.symbol,
    timeframe: config.timeframe,
    dataSource: source,
    totalBars: result.totalBars,
    numSteps: result.numSteps,
    train: {
      sharpe: result.metrics.train.sharpeRatio,
      maxDrawdown: result.metrics.train.maxDrawdown,
      winRate: result.metrics.train.winRate,
      totalPnl: result.metrics.train.totalPnl,
      numTrades: result.metrics.train.numTrades,
    },
    val: {
      sharpe: result.metrics.val.sharpeRatio,
      maxDrawdown: result.metrics.val.maxDrawdown,
      winRate: result.metrics.val.winRate,
      totalPnl: result.metrics.val.totalPnl,
      numTrades: result.metrics.val.numTrades,
    },
    test: {
      sharpe: result.metrics.test.sharpeRatio,
      maxDrawdown: result.metrics.test.maxDrawdown,
      winRate: result.metrics.test.winRate,
      totalPnl: result.metrics.test.totalPnl,
      numTrades: result.metrics.test.numTrades,
    },
    baselines: baselines.map((b) => ({
      name: b.name,
      sharpe: b.report.sharpeRatio,
      winRate: b.report.winRate,
      totalPnl: b.report.totalPnl,
    })),
  };

  if (opts.json || opts.output) {
    writeOutput(output, opts.output, opts.json);
    return;
  }

  logger.info(`Backtest: ${config.experimentId}`);
  logger.info(`Symbol: ${config.symbol} | TF: ${config.timeframe} | Source: ${source}`);
  logger.info(`Bars: ${result.totalBars} | Steps: ${result.numSteps}`);
  logger.info('');
  printTable(
    ['Split', 'Sharpe', 'MaxDD', 'Win%', 'PnL', 'Trades'],
    [
      { label: 'train', m: result.metrics.train },
      { label: 'val', m: result.metrics.val },
      { label: 'test', m: result.metrics.test },
    ].map((row) => [
      row.label,
      row.m.sharpeRatio.toFixed(2),
      (row.m.maxDrawdown * 100).toFixed(1) + '%',
      (row.m.winRate * 100).toFixed(1) + '%',
      row.m.totalPnl.toFixed(4),
      String(row.m.numTrades),
    ]),
  );
  logger.info('');
}
