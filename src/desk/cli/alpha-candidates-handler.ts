/**
 * Alpha Candidates Handler — lists available experiment configs and baselines.
 */
import { logger } from '../../shared/utils/logger';
import { loadAllConfigs, printTable } from './alpha-helpers';

const BASELINES = [
  'buy-and-hold',
  'random-entry',
  'simple-momentum',
  'simple-mean-reversion',
];

export function handleCandidates(opts: { json?: boolean }): void {
  const configs = loadAllConfigs();

  if (opts.json) {
    logger.info(JSON.stringify({ configs, baselines: BASELINES }, null, 2));
    return;
  }

  logger.info('Alpha Discovery — Available Candidates');
  logger.info('');
  if (configs.length === 0) {
    logger.info('  No experiment configs found in alpha-lab/configs/');
  } else {
    printTable(
      ['Experiment ID', 'Symbol', 'TF', 'Features'],
      configs.map((c) => [
        c.experimentId,
        c.symbol,
        c.timeframe,
        c.features.join(', '),
      ]),
    );
  }
  logger.info('');
  logger.info('Baselines:');
  for (const b of BASELINES) logger.info(`  - ${b}`);
  logger.info('');
}
