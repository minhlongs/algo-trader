/**
 * Alpha Compare Handler — runs two experiments and shows side-by-side comparison.
 */
import { logger } from '../../shared/utils/logger';
import { loadConfigByName, loadCandlesForConfig, writeOutput, printTable } from './alpha-helpers';
import { runExperiment } from '../../alpha-lab/experiments/experiment-engine';

export async function handleCompare(
  expA: string,
  expB: string,
  opts: { json?: boolean; output?: string },
): Promise<void> {
  const configA = loadConfigByName(expA);
  const configB = loadConfigByName(expB);

  const { candles: candlesA, source: srcA } = await loadCandlesForConfig(configA);
  const resultA = runExperiment({ candles: candlesA, config: configA });

  const { candles: candlesB, source: srcB } = await loadCandlesForConfig(configB);
  const resultB = runExperiment({ candles: candlesB, config: configB });

  interface MetricRow {
    metric: string;
    a: string;
    b: string;
    winner: string;
  }

  const metrics: MetricRow[] = [];
  const pairs: Array<{
    label: string;
    valA: number;
    valB: number;
    higherIsBetter: boolean;
  }> = [
    { label: 'Test Sharpe', valA: resultA.metrics.test.sharpeRatio, valB: resultB.metrics.test.sharpeRatio, higherIsBetter: true },
    { label: 'Test Win Rate', valA: resultA.metrics.test.winRate, valB: resultB.metrics.test.winRate, higherIsBetter: true },
    { label: 'Test PnL', valA: resultA.metrics.test.totalPnl, valB: resultB.metrics.test.totalPnl, higherIsBetter: true },
    { label: 'Test MaxDD', valA: resultA.metrics.test.maxDrawdown, valB: resultB.metrics.test.maxDrawdown, higherIsBetter: false },
    { label: 'Val Sharpe', valA: resultA.metrics.val.sharpeRatio, valB: resultB.metrics.val.sharpeRatio, higherIsBetter: true },
    { label: 'Train Sharpe', valA: resultA.metrics.train.sharpeRatio, valB: resultB.metrics.train.sharpeRatio, higherIsBetter: true },
  ];

  for (const p of pairs) {
    const aWins = p.higherIsBetter ? p.valA > p.valB : p.valA < p.valB;
    const tie = p.valA === p.valB;
    metrics.push({
      metric: p.label,
      a: p.valA.toFixed(4),
      b: p.valB.toFixed(4),
      winner: tie ? 'tie' : aWins ? configA.experimentId : configB.experimentId,
    });
  }

  const output = {
    experimentA: configA.experimentId,
    experimentB: configB.experimentId,
    dataSourceA: srcA,
    dataSourceB: srcB,
    metrics,
  };

  if (opts.json || opts.output) {
    writeOutput(output, opts.output, opts.json);
    return;
  }

  logger.info(`Compare: ${configA.experimentId} vs ${configB.experimentId}`);
  logger.info('');
  printTable(
    ['Metric', configA.experimentId, configB.experimentId, 'Winner'],
    metrics.map((m) => [m.metric, m.a, m.b, m.winner]),
  );
  logger.info('');
}