/**
 * In-Memory HTTP Status Server & Prometheus Metrics Registry Helper
 * Re-exports and wraps production DeskStatusServer and DeskMetricsRegistry
 */

import { DeskMetricsRegistry } from '../../../../src/desk/telemetry/desk-metrics-registry';
import { DeskStatusServer as ProdDeskStatusServer } from '../../../../src/desk/daemon/desk-status-server';
import type { DeskStatusEngineEntry } from '../../../../src/desk/daemon/desk-status-server-types';

export { DeskMetricsRegistry };

export interface DeskStatusPayload {
  status: 'INITIALIZING' | 'RUNNING' | 'PAUSED' | 'STOPPED' | 'EMERGENCY_HALT';
  mode: 'PAPER' | 'SHADOW' | 'LIVE';
  circuitBreakerTier: 'NORMAL' | 'ALERT' | 'REDUCE' | 'HALT' | 'HARD_STOP';
  navUsd: number;
  engines: Record<string, { status: string; lastSignalTime?: number; error?: string }>;
  allocations: {
    allocatedCapitalUsd: Record<string, number>;
    unallocatedCashUsd: number;
    driftUsd: number;
  };
}

export class DeskStatusServer {
  private prodServer: ProdDeskStatusServer | null = null;
  private port = 0;

  constructor(
    public readonly metricsRegistry: DeskMetricsRegistry,
    private readonly statusProvider: () => DeskStatusPayload,
  ) {}

  public async start(desiredPort = 0): Promise<number> {
    this.prodServer = new ProdDeskStatusServer({
      port: desiredPort,
      metricsRegistry: this.metricsRegistry,
      dataProvider: {
        getUptimeSeconds: () => 0,
        getStatus: () => {
          const s = this.statusProvider();
          const engines: Record<string, DeskStatusEngineEntry> = {};
          for (const [id, info] of Object.entries(s.engines)) {
            engines[id] = {
              status: info.status,
              allocatedCapitalUsd: s.allocations.allocatedCapitalUsd[id] ?? 0,
              lastSignalTime: info.lastSignalTime,
              error: info.error,
            };
          }
          return {
            status: s.status,
            mode: s.mode,
            circuitBreakerTier: s.circuitBreakerTier,
            navUsd: s.navUsd,
            driftUsd: s.allocations.driftUsd,
            engines,
            allocatedCapitalUsd: s.allocations.allocatedCapitalUsd,
            unallocatedCashUsd: s.allocations.unallocatedCashUsd,
          };
        },
        getAllocations: () => {
          const s = this.statusProvider();
          return {
            totalNavUsd: s.navUsd,
            unallocatedCashUsd: s.allocations.unallocatedCashUsd,
            cashBufferRatio: s.navUsd > 0 ? s.allocations.unallocatedCashUsd / s.navUsd : 0,
            allocations: s.allocations.allocatedCapitalUsd,
            allocatedCapitalUsd: s.allocations.allocatedCapitalUsd,
            driftUsd: s.allocations.driftUsd,
            isZeroDrift: s.allocations.driftUsd < 1e-4,
          };
        },
        getMetricsText: () => this.metricsRegistry.getMetricsText(),
      },
    });
    await this.prodServer.start();
    this.port = this.prodServer.getPort();
    return this.port;
  }

  public getPort(): number {
    return this.port;
  }

  public async stop(): Promise<void> {
    if (this.prodServer) {
      await this.prodServer.stop();
      this.prodServer = null;
    }
  }
}
