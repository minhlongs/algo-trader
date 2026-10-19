/**
 * CashClaw Trade Run Handler — Executes V2 strategies via live/paper trading pipeline.
 *
 * Supports both single-strategy and multi-strategy (comma-separated or "all") modes.
 * Extracted from cashclaw-trade-commands.ts to keep files under 200 lines.
 */
import { logger } from '../../shared/utils/logger';
import { validateLiveEnv, confirmLiveTrading } from './cashclaw-trade-env-validator';
import { runSingleStrategy, runMultiStrategy } from './cashclaw-trade-runner-subroutines';

export async function handleTradeRun(opts: {
  strategy: string;
  mode: string;
  capital: string;
  ticks: string;
  interval: string;
  yes: boolean;
}): Promise<void> {
  const capitalUsdc = parseFloat(opts.capital);
  const maxTicks = parseInt(opts.ticks, 10);
  const tickIntervalMs = parseInt(opts.interval, 10);

  if (isNaN(capitalUsdc) || capitalUsdc <= 0) {
    logger.error('Error: --capital must be a positive number');
    process.exit(1);
  }
  if (isNaN(tickIntervalMs) || tickIntervalMs < 1000) {
    logger.error('Error: --interval must be >= 1000ms');
    process.exit(1);
  }

  const isLive = opts.mode === 'live';

  // Resolve strategy list
  const { getStrategy, listStrategies } = await import('../polymarket/strategy-registry');
  let strategyNames: string[];
  if (opts.strategy === 'all') {
    strategyNames = listStrategies().map((s) => s.name);
  } else if (opts.strategy.includes(',')) {
    strategyNames = opts.strategy.split(',').map((s) => s.trim());
  } else {
    strategyNames = [opts.strategy];
  }

  // Validate all exist
  const missing = strategyNames.filter((n) => !getStrategy(n));
  if (missing.length > 0) {
    logger.error(`Unknown strategies: ${missing.join(', ')}`);
    logger.error('Use "cashclaw trade list-strategies" to see available options.');
    process.exit(1);
  }

  const isMulti = strategyNames.length > 1;

  if (isLive) {
    validateLiveEnv();
    await confirmLiveTrading({ strategyNames, capitalUsdc, maxTicks, yes: opts.yes });
  }

  const modeLabel = isLive ? 'LIVE' : 'PAPER';
  logger.info(`\nCashClaw ${modeLabel} Strategy Runner`);
  logger.info(
    `Strategies: ${strategyNames.join(', ')} | Capital: $${capitalUsdc} | Ticks: ${maxTicks > 0 ? maxTicks : 'unlimited'} | Interval: ${tickIntervalMs}ms`,
  );
  if (isMulti) {
    logger.info(`Running ${strategyNames.length} strategies concurrently (shared guard + journal)`);
  }
  logger.info('Starting... (Ctrl+C to stop)\n');

  if (!isMulti) {
    await runSingleStrategy({ strategyName: strategyNames[0], isLive, capitalUsdc, tickIntervalMs, maxTicks });
  } else {
    await runMultiStrategy({ strategyNames, isLive, capitalUsdc, tickIntervalMs, maxTicks });
  }

  logger.info('Done.\n');
}
