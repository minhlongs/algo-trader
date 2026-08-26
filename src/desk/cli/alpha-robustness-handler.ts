/**
 * Alpha Robustness Handler — runs experiment under cost stress modes.
 */
import { logger } from '../../shared/utils/logger';
import { loadConfigByName, loadCandlesForConfig, writeOutput, printTable } from './alpha-helpers';
import { runExperiment } from '../../alpha-lab/experiments/experiment-engine';
import type { ExperimentConfig } from '../../alpha-lab/experiments/experiment-types';
import { type CostStressConfig } from '../../alpha-lab/cost-model/cost-stress';

interface StressResult {
  mode: string;
  label: string;
  feeBps: number;
  slippageBps: number;
  effectiveRoundTripBps: number;
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

  const { candles, source, dataSources } = await loadCandlesForConfig(config);
  const modes = costStressModule.listStressModes();
  const stressResults: StressResult[] = [];

  for (const mode of modes) {
    const stressCfg: CostStressConfig = costStressModule.resolveCostConfig(mode);
    // Fold spread + marketImpact into feeBps so the experiment engine sees the
    // full round-trip friction via the two-parameter cost shape it already accepts.
    const { feeBps, slippageBps } = costStressModule.applyStressToBaselineConfig(undefined, mode);
    const adaptedConfig: ExperimentConfig = {
      ...config,
      experimentId: `${config.experimentId}-stress-${mode}`,
      cost: {
        feeBps,
        slippageBps,
        scenario: mode.toLowerCase() as ExperimentConfig['cost']['scenario'],
      },
    };

    try {
      const result = runExperiment({ candles, config: adaptedConfig, dataSources });
      stressResults.push({
        mode,
        label: stressCfg.label,
        feeBps: stressCfg.feeBps,
        slippageBps: stressCfg.slippageBps,
        effectiveRoundTripBps: costStressModule.totalRoundTripCostBps(stressCfg),
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
        effectiveRoundTripBps: costStressModule.totalRoundTripCostBps(stressCfg),
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
    ['Mode', 'Fee(bps)', 'Slip(bps)', 'EffectiveRT(bps)', 'Test SR', 'Test WR', 'PnL', 'Edge?'],
    stressResults.map((r) => [
      r.mode,
      String(r.feeBps),
      String(r.slippageBps),
      String(r.effectiveRoundTripBps),
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