/**
 * Alpha Walk-Forward Handler — runs walk-forward evaluation showing step-by-step results.
 */
import { logger } from '../../shared/utils/logger';
import { loadConfigByName, loadCandlesForConfig, writeOutput, printTable } from './alpha-helpers';
import { evaluateWalkForward } from '../../alpha-lab/walkforward/walkforward-evaluator';

export async function handleWalkforward(
  experiment: string,
  opts: { json?: boolean; output?: string },
): Promise<void> {
  const config = loadConfigByName(experiment);
  const { candles, source } = await loadCandlesForConfig(config);
  const wfResult = evaluateWalkForward({ candles, config });

  const output = {
    experimentId: config.experimentId,
    symbol: config.symbol,
    timeframe: config.timeframe,
    dataSource: source,
    summary: wfResult.summary,
    steps: wfResult.steps.map((s) => ({
      step: s.step,
      trainSharpe: s.trainMetrics.sharpeRatio,
      trainWinRate: s.trainMetrics.winRate,
      valSharpe: s.valMetrics.sharpeRatio,
      valWinRate: s.valMetrics.winRate,
      testSharpe: s.testMetrics.sharpeRatio,
      testWinRate: s.testMetrics.winRate,
      testTrades: s.testMetrics.numTrades,
    })),
  };

  if (opts.json || opts.output) {
    writeOutput(output, opts.output, opts.json);
    return;
  }

  logger.info(`Walk-Forward: ${config.experimentId}`);
  logger.info(`Symbol: ${config.symbol} | TF: ${config.timeframe} | Source: ${source}`);
  logger.info('');

  const stepRows = wfResult.steps.map((s) => [
    String(s.step),
    s.trainMetrics.sharpeRatio.toFixed(2),
    s.valMetrics.sharpeRatio.toFixed(2),
    s.testMetrics.sharpeRatio.toFixed(2),
    (s.testMetrics.winRate * 100).toFixed(1) + '%',
    String(s.testMetrics.numTrades),
  ]);
  printTable(
    ['Step', 'Train SR', 'Val SR', 'Test SR', 'Test WR', 'Trades'],
    stepRows,
  );

  const sm = wfResult.summary;
  logger.info('');
  logger.info(`Summary: ${sm.totalSteps} steps | Overfit gap: ${(sm.overfitGap * 100).toFixed(1)}% | Consistency: ${(sm.consistencyScore * 100).toFixed(0)}%`);
  logger.info('');
}