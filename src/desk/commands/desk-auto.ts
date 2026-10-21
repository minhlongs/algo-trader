/**
 * DESK:AUTO Command — Multi-Engine Autonomous Desk Runner & Live Execution Daemon
 *
 * Orchestrates all 4 autonomous trading engines (Arbitrage, MARL MM, AMM Liquidity, Alpha-Lab)
 * through the UnifiedTradingLoop, priority signal queue, and live risk guards.
 *
 * Split: the in-memory IDeskDaemon stub lives in desk-auto-stub-daemon.ts; this
 * module owns the CLI entry point and its live-mode confirmation flow.
 */

import { createInterface } from 'readline';
import { logger } from '../../shared/utils/logger';
import { DeskDaemon } from '../daemon/desk-daemon';
import {
  type DeskAutoConfig,
  type DeskAutoRunResult,
  type IDeskDaemon,
  parseDeskAutoConfig,
} from './desk-auto-types';

export { StubDeskDaemon } from './desk-auto-stub-daemon';

export interface RunDeskAutoDependencies {
  daemon?: IDeskDaemon;
  createDaemon?: (config: DeskAutoConfig) => IDeskDaemon;
  promptConfirm?: () => Promise<boolean>;
}

/** Accept only an explicit affirmative answer to the live-capital prompt. */
async function promptConfirmation(): Promise<boolean> {
  if (process.env.CONFIRM_LIVE === 'true') {
    return true;
  }
  if (!process.stdin.isTTY) {
    logger.warn('[DeskAuto] Non-interactive session detected without CONFIRM_LIVE=true');
    return false;
  }

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise<boolean>((resolve) => {
    rl.question('Confirm LIVE trading with real capital at risk? (yes/no): ', (answer: string) => {
      rl.close();
      const trimmed = answer.trim().toLowerCase();
      resolve(trimmed === 'yes' || trimmed === 'y');
    });
  });
}

/** Fail-closed live gate: nothing runs until an operator confirms. */
async function confirmLiveExecution(deps: RunDeskAutoDependencies): Promise<void> {
  logger.warn('⚠️  LIVE MODE ACTIVE — REAL CAPITAL AT RISK ACROSS VENUES!');
  const confirmFn = deps.promptConfirm ?? promptConfirmation;
  const confirmed = await confirmFn();
  if (!confirmed) {
    logger.warn('⚠️  Live trading confirmation declined by operator. Aborting desk execution.');
    throw new Error('Live trading confirmation declined');
  }
  logger.info('✅ Live execution confirmed by operator.');
}

/** Resolve the daemon to run, honouring injected test doubles. */
function resolveDaemon(config: DeskAutoConfig, deps: RunDeskAutoDependencies): IDeskDaemon {
  if (deps.daemon) return deps.daemon;
  if (deps.createDaemon) return deps.createDaemon(config);
  return new DeskDaemon(config);
}

/**
 * Main entry point for `desk:auto` CLI command.
 */
export async function runDeskAuto(
  rawOptions: unknown = {},
  deps: RunDeskAutoDependencies = {},
): Promise<DeskAutoRunResult> {
  const config = parseDeskAutoConfig(rawOptions);

  logger.info('⚡ DESK:AUTO — Multi-Engine Autonomous Desk Runner');
  logger.info(`  Mode: ${config.mode} | Capital: $${config.capitalUsd.toLocaleString()} | Dry-Run: ${config.dryRun}`);
  logger.info(`  Exchanges: ${config.exchanges.join(', ')} | Symbols: ${config.symbols.join(', ')}`);
  logger.info(`  Poll Interval: ${config.pollIntervalMs}ms | Metrics Port: ${config.metricsPort}`);

  if (config.mode === 'LIVE' && !config.dryRun) {
    await confirmLiveExecution(deps);
  }

  const daemon = resolveDaemon(config, deps);
  await daemon.start();

  if (config.durationSeconds !== undefined && config.durationSeconds > 0) {
    logger.info(`[DeskAuto] Running desk daemon for ${config.durationSeconds}s`);
    await new Promise((resolve) => setTimeout(resolve, config.durationSeconds! * 1000));
    await daemon.stop();
  }

  return {
    config,
    daemon,
    status: daemon.getStatus(),
  };
}
