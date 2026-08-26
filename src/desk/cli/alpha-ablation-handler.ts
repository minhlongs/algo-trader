/**
 * Alpha Ablation Handler — drops each feature one at a time and reports incremental contribution.
 */
import { logger } from '../../shared/utils/logger';
import { loadConfigByName, loadCandlesForConfig, writeOutput, printTable } from './alpha-helpers';
import { runExperiment } from '../../alpha-lab/experiments/experiment-engine';
import type { ExperimentConfig } from '../../alpha-lab/experiments/experiment-types';

interface AblationResult {
  removedFeature: string;
  testSharpe: number;
  deltaSharpe: number;
  testPnl: number;
  deltaPnl: number;
  contribution: string;
}

export async function handleAblation(
  experiment: string,
  opts: { json?: boolean; output?: string },
): Promise<void> {
  const config = loadConfigByName(experiment);
  const { candles, source, dataSources } = await loadCandlesForConfig(config);

  // Run full experiment as baseline
  const fullResult = runExperiment({ candles, config, dataSources });
  const fullSharpe = fullResult.metrics.test.sharpeRatio;
  const fullPnl = fullResult.metrics.test.totalPnl;

  // Ablation: run with each feature removed
  const ablationResults: AblationResult[] = [];

  for (const feature of config.features) {
    const ablatedConfig: ExperimentConfig = {
      ...config,
      experimentId: `${config.experimentId}-ablated-${feature}`,
      features: config.features.filter((f) => f !== feature),
    };

    if (ablatedConfig.features.length === 0) {
      ablationResults.push({
        removedFeature: feature,
        testSharpe: 0,
        deltaSharpe: 0,
        testPnl: 0,
        deltaPnl: 0,
        contribution: 'last feature',
      });
      continue;
    }

    try {
      const ablatedResult = runExperiment({ candles, config: ablatedConfig, dataSources });
      const testSharpe = ablatedResult.metrics.test.sharpeRatio;
      const testPnl = ablatedResult.metrics.test.totalPnl;

      ablationResults.push({
        removedFeature: feature,
        testSharpe,
        deltaSharpe: fullSharpe - testSharpe,
        testPnl,
        deltaPnl: fullPnl - testPnl,
        contribution: fullSharpe - testSharpe > 0.01 ? 'significant' : fullSharpe - testSharpe > 0 ? 'marginal' : 'negative',
      });
    } catch {
      ablationResults.push({
        removedFeature: feature,
        testSharpe: 0,
        deltaSharpe: 0,
        testPnl: 0,
        deltaPnl: 0,
        contribution: 'error',
      });
    }
  }

  const output = {
    experimentId: config.experimentId,
    features: config.features,
    fullTestSharpe: fullSharpe,
    fullTestPnl: fullPnl,
    dataSource: source,
    ablationResults,
  };

  if (opts.json || opts.output) {
    writeOutput(output, opts.output, opts.json);
    return;
  }

  logger.info(`Ablation: ${config.experimentId}`);
  logger.info(`Full model test Sharpe: ${fullSharpe.toFixed(4)} | PnL: ${fullPnl.toFixed(4)}`);
  logger.info(`Features: ${config.features.join(', ')}`);
  logger.info('');
  printTable(
    ['Removed', 'Test SR', 'Delta SR', 'Test PnL', 'Delta PnL', 'Contribution'],
    ablationResults.map((r) => [
      r.removedFeature,
      r.testSharpe.toFixed(4),
      r.deltaSharpe >= 0 ? '+' + r.deltaSharpe.toFixed(4) : r.deltaSharpe.toFixed(4),
      r.testPnl.toFixed(4),
      r.deltaPnl >= 0 ? '+' + r.deltaPnl.toFixed(4) : r.deltaPnl.toFixed(4),
      r.contribution,
    ]),
  );
  logger.info('');
}