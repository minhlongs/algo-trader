/**
 * In-Memory Test Harness for Autonomous Desk Runner Daemon
 * Orchestrates isolated components with port 0 or custom configs
 */

import { z } from 'zod';
import { FeedFreshnessWatchdog } from '../../../../src/desk/feeds/feed-freshness-watchdog';
import { EngineSupervisor } from '../../../../src/desk/daemon/engine-supervisor';
import { verifyZeroDrift } from '../../../../src/desk/daemon/desk-daemon-types';
import { DeskMetricsRegistry, DeskStatusServer, type DeskStatusPayload } from './daemon-server-helper';

export {
  FeedFreshnessWatchdog,
  EngineSupervisor,
  verifyZeroDrift,
  DeskMetricsRegistry,
  DeskStatusServer,
  type DeskStatusPayload,
};

export const DeskAutoConfigSchema = z.object({
  mode: z.enum(['PAPER', 'SHADOW', 'LIVE']).default('PAPER'),
  capitalUsd: z.number().positive().default(100_000),
  dryRun: z.boolean().default(true),
  exchanges: z.array(z.string().min(1)).min(1).default(['binance', 'bybit', 'polymarket_clob']),
  symbols: z.array(z.string().min(1)).min(1).default(['BTC/USDT', 'ETH/USDT']),
  pollIntervalMs: z.number().int().min(50).default(1000),
  metricsPort: z.number().int().min(0).max(65535).default(9100),
  durationSeconds: z.number().positive().optional(),
});
export type DeskAutoConfig = z.infer<typeof DeskAutoConfigSchema>;

export class DaemonTestHarness {
  public readonly config: DeskAutoConfig;
  public readonly supervisor: EngineSupervisor;
  public readonly watchdog: FeedFreshnessWatchdog;
  public readonly metrics: DeskMetricsRegistry;
  public server: DeskStatusServer | null = null;
  public state: DeskStatusPayload['status'] = 'INITIALIZING';
  public circuitBreakerTier: DeskStatusPayload['circuitBreakerTier'] = 'NORMAL';

  constructor(partialConfig?: Partial<DeskAutoConfig>) {
    this.config = DeskAutoConfigSchema.parse(partialConfig ?? {});
    this.supervisor = new EngineSupervisor();
    this.watchdog = new FeedFreshnessWatchdog(5000, () => {
      this.circuitBreakerTier = 'HALT';
    });
    this.metrics = new DeskMetricsRegistry();
  }

  public async startServer(desiredPort = 0): Promise<number> {
    this.server = new DeskStatusServer(this.metrics, () => ({
      status: this.state,
      mode: this.config.mode,
      circuitBreakerTier: this.circuitBreakerTier,
      navUsd: this.config.capitalUsd,
      engines: this.supervisor.getEngineStatuses(),
      allocations: {
        allocatedCapitalUsd: { arbitrage: 25000, marl: 25000, amm: 25000, 'alpha-lab': 25000 },
        unallocatedCashUsd: 0,
        driftUsd: 0,
      },
    }));
    return this.server.start(desiredPort);
  }

  public async triggerEmergencyHalt(): Promise<number> {
    const t0 = performance.now();
    this.state = 'EMERGENCY_HALT';
    this.circuitBreakerTier = 'HARD_STOP';
    await this.supervisor.stop();
    if (this.server) {
      await this.server.stop();
      this.server = null;
    }
    return performance.now() - t0;
  }

  public async cleanup(): Promise<void> {
    if (this.server) {
      await this.server.stop();
      this.server = null;
    }
    await this.supervisor.stop();
  }
}
