/**
 * Alpha Robustness Handler — runs experiment under cost stress modes.
 */
import { logger } from '../../shared/utils/logger';
import { loadConfigByName, loadCandlesForConfig, writeOutput, printTable } from './alpha-helpers';
import { runExperiment } from '../../alpha-lab/experiments/experiment-engine';
import type { ExperimentConfig } from '../../alpha-lab/experiments/experiment-types';

interface StressResult {
  mode: string;
  label: string;
  feeBps: number;
  slippageBps: number;
  testSharpe: number;
  testWinRate: number;
  testPnl: number;
  edgeSurvives: boolean;
}

export async function handleRobustness(
  experiment: string,
  opts: { json?: boolean; output?: string },
): Promise<void> {
  const config = loadConfigByName(experiment);

  // Lazy import — cost-model is built in parallel by another agent
  let costStressModule: typeof import('../../alpha-lab/cost-model/cost-stress');
  try {
    costStressModule = await import('../../alpha-lab/cost-model/cost-stress');
  } catch {
    logger.error('Cost stress model not yet available. This feature is under construction.');
    return;
  }

  const { candles, source } = await loadCandlesForConfig(config);
  const modes = costStressModule.listStressModes();
  const stressResults: StressResult[] = [];

  for (const mode of modes) {
    const stressCfg = costStressModule.resolveCostConfig(mode);
    const adaptedConfig: ExperimentConfig = {
      ...config,
      experimentId: `${config.experimentId}-stress-${mode}`,
      cost: {
        feeBps: stressCfg.feeBps,
        slippageBps: stressCfg.slippageBps,
        scenario: mode.toLowerCase() as ExperimentConfig['cost']['scenario'],
      },
    };

    try {
      const result = runExperiment({ candles, config: adaptedConfig });
      stressResults.push({
        mode,
        label: stressCfg.label,
        feeBps: stressCfg.feeBps,
        slippageBps: stressCfg.slippageBps,
        testSharpe: result.metrics.test.sharpeRatio,
        testWinRate: result.metrics.test.winRate,
        testPnl: result.metrics.test.totalPnl,
        edgeSurvives: result.metrics.test.sharpeRatio > 0,
      });
    } catch {
      stressResults.push({
        mode,
        label: stressCfg.label,
        feeBps: stressCfg.feeBps,
        slippageBps: stressCfg.slippageBps,
        testSharpe: 0,
        testWinRate: 0,
        testPnl: 0,
        edgeSurvives: false,
      });
    }
  }

  const output = {
    experimentId: config.experimentId,
    symbol: config.symbol,
    dataSource: source,
    stressResults,
  };

  if (opts.json || opts.output) {
    writeOutput(output, opts.output, opts.json);
    return;
  }

  logger.info(`Robustness: ${config.experimentId}`);
  logger.info(`Symbol: ${config.symbol} | Source: ${source}`);
  logger.info('');
  printTable(
    ['Mode', 'Fee(bps)', 'Slip(bps)', 'Test SR', 'Test WR', 'PnL', 'Edge?'],
    stressResults.map((r) => [
      r.mode,
      String(r.feeBps),
      String(r.slippageBps),
      r.testSharpe.toFixed(2),
      (r.testWinRate * 100).toFixed(1) + '%',
      r.testPnl.toFixed(4),
      r.edgeSurvives ? 'YES' : 'NO',
    ]),
  );
  logger.info('');
  const surviving = stressResults.filter((r) => r.edgeSurvives).length;
  logger.info(`Edge survives in ${surviving}/${modes.length} cost modes.`);
  logger.info('');
}