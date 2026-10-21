/**
 * Desk Auto Stub Daemon
 *
 * In-memory IDeskDaemon implementation used when running the `desk:auto` command
 * stand-alone, before the full M3 supervisor is wired in. Extracted from the CLI
 * entry point so the daemon surface and the interactive confirmation flow evolve
 * independently.
 */

import { logger } from '../../shared/utils/logger';
import type { IDeskDaemon } from './desk-auto-types';
import type { DeskAutoConfig } from './desk-auto-types';

/** Circuit-breaker tier reported by the stub, which performs no risk checks. */
const STUB_CIRCUIT_BREAKER_TIER = 'NORMAL';

/** Engine ids reported by the stub's status snapshot. */
const STUB_ENGINE_IDS = ['arbitrage', 'marl', 'amm', 'alphaLab'] as const;

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
    const status = this.running ? 'RUNNING' : 'STOPPED';
    return {
      status,
      mode: this.config.mode,
      capitalUsd: this.config.capitalUsd,
      dryRun: this.config.dryRun,
      circuitBreakerTier: STUB_CIRCUIT_BREAKER_TIER,
      navUsd: this.config.capitalUsd,
      uptimeSeconds: this.getUptimeSeconds(),
      cycleCount: this.cycleCount,
      exchanges: [...this.config.exchanges],
      symbols: [...this.config.symbols],
      engines: Object.fromEntries(
        STUB_ENGINE_IDS.map((id) => [id, { status: this.running ? 'ACTIVE' : 'STOPPED' }]),
      ),
    };
  }
}
