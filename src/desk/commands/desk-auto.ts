/**
 * DESK:AUTO Command — Multi-Engine Autonomous Desk Runner & Live Execution Daemon
 *
 * Orchestrates all 4 autonomous trading engines (Arbitrage, MARL MM, AMM Liquidity, Alpha-Lab)
 * through the UnifiedTradingLoop, priority signal queue, and live risk guards.
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

export interface RunDeskAutoDependencies {
  daemon?: IDeskDaemon;
  createDaemon?: (config: DeskAutoConfig) => IDeskDaemon;
  promptConfirm?: () => Promise<boolean>;
}

/**
 * Stateful in-memory daemon implementation satisfying IDeskDaemon interface.
 * Used when running stand-alone or before full M3 supervisor wiring.
 */
export class StubDeskDaemon implements IDeskDaemon {
  private running = false;
  private startedAt = 0;
  private cycleCount = 0;

  constructor(public readonly config: DeskAutoConfig) {}

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    this.startedAt = Date.now();
    this.cycleCount = 1;

    logger.info(`[DeskDaemon] Daemon started in ${this.config.mode} mode`, {
      capitalUsd: this.config.capitalUsd,
      dryRun: this.config.dryRun,
      pollIntervalMs: this.config.pollIntervalMs,
      metricsPort: this.config.metricsPort,
    });
  }

  async stop(): Promise<void> {
    if (!this.running) return;
    this.running = false;
    logger.info('[DeskDaemon] Daemon stopped gracefully', {
      totalCycles: this.cycleCount,
      uptimeSeconds: this.getUptimeSeconds(),
    });
  }

  isRunning(): boolean {
    return this.running;
  }

  getUptimeSeconds(): number {
    return this.running ? Math.floor((Date.now() - this.startedAt) / 1000) : 0;
  }

  getStatus(): Record<string, unknown> {
    return {
      status: this.running ? 'RUNNING' : 'STOPPED',
      mode: this.config.mode,
      capitalUsd: this.config.capitalUsd,
      dryRun: this.config.dryRun,
      circuitBreakerTier: 'NORMAL',
      navUsd: this.config.capitalUsd,
      uptimeSeconds: this.getUptimeSeconds(),
      cycleCount: this.cycleCount,
      exchanges: [...this.config.exchanges],
      symbols: [...this.config.symbols],
      engines: {
        arbitrage: { status: this.running ? 'ACTIVE' : 'STOPPED' },
        marl: { status: this.running ? 'ACTIVE' : 'STOPPED' },
        amm: { status: this.running ? 'ACTIVE' : 'STOPPED' },
        alphaLab: { status: this.running ? 'ACTIVE' : 'STOPPED' },
      },
    };
  }
}

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
    logger.warn('⚠️  LIVE MODE ACTIVE — REAL CAPITAL AT RISK ACROSS VENUES!');
    const confirmFn = deps.promptConfirm ?? promptConfirmation;
    const confirmed = await confirmFn();
    if (!confirmed) {
      logger.warn('⚠️  Live trading confirmation declined by operator. Aborting desk execution.');
      throw new Error('Live trading confirmation declined');
    }
    logger.info('✅ Live execution confirmed by operator.');
  }

  let daemon: IDeskDaemon;
  if (deps.daemon) {
    daemon = deps.daemon;
  } else if (deps.createDaemon) {
    daemon = deps.createDaemon(config);
  } else {
    daemon = new DeskDaemon(config);
  }

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
