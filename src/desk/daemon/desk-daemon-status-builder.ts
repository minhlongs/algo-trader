/**
 * Desk Daemon Status & Allocations Payload Builder
 *
 * @module desk/daemon/desk-daemon-status-builder
 */

import type { DeskAutoConfig } from '../commands/desk-auto-types';
import { UnifiedTradingLoop } from '../orchestrator/unified-trading-loop';
import type { IEngineSupervisor } from './engine-supervisor-types';
import type {
  DeskStatusEngineEntry,
  DeskAllocationsResponse,
} from './desk-status-server-types';
import type { DeskMetricsRegistry } from '../telemetry/desk-metrics-registry';
import { type DriftVerificationResult, verifyZeroDrift } from './desk-daemon-types';
import { logger } from '../../shared/utils/logger';

export interface DeskStatusBuilderParams {
  loop: UnifiedTradingLoop;
  supervisor: IEngineSupervisor;
  config: DeskAutoConfig;
  running: boolean;
  uptimeSeconds: number;
  cycleCount: number;
  processedOrders: number;
}

export class DeskDaemonStatusBuilder {
  public static initLoop(config: DeskAutoConfig, existingLoop?: UnifiedTradingLoop): UnifiedTradingLoop {
    if (existingLoop) return existingLoop;
    const cash = config.capitalUsd * 0.20, alloc = (config.capitalUsd - cash) / 4;
    const loop = new UnifiedTradingLoop(config.mode, config.capitalUsd, cash);
    loop.riskGate.setEngineBudgets({ arbitrage: alloc, marl: alloc, amm: alloc, 'alpha-lab': alloc });
    loop.riskGate.setNavAndCash(config.capitalUsd, cash);
    return loop;
  }

  public static updateMetrics(
    metricsRegistry: DeskMetricsRegistry,
    loop: UnifiedTradingLoop,
    processedOrders: number,
  ): void {
    const drift = DeskDaemonStatusBuilder.verifyDrift(loop);
    metricsRegistry.updateFromSnapshot({
      allocatedCapital: loop.riskGate.getEngineBudgets(),
      queueDepth: loop.queue.size(),
      fillRate: processedOrders > 0 ? 1.0 : 0.0,
      circuitBreakerTier: loop.riskGate.getTier(),
      driftUsd: drift.driftUsd,
    });
  }

  public static bindSignalHandlers(
    onSignal: (sig: string) => void,
    skipSignalHandlers?: boolean,
  ): Array<{ event: string; listener: () => void }> {
    const bound: Array<{ event: string; listener: () => void }> = [];
    if (skipSignalHandlers) return bound;
    for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP'] as NodeJS.Signals[]) {
      const listener = () => { onSignal(sig); };
      process.on(sig, listener);
      bound.push({ event: sig, listener });
    }
    return bound;
  }

  public static verifyDrift(loop: UnifiedTradingLoop): DriftVerificationResult {
    const nav = loop.riskGate.getNav();
    const allocated = loop.riskGate.getEngineBudgets();
    const cash = loop.riskGate.getCash();
    const result = verifyZeroDrift(nav, allocated, cash);
    if (!result.valid) {
      logger.error(`[DeskDaemon] Zero Accounting Drift violated: ${result.driftUsd.toFixed(6)} USD`);
    }
    return result;
  }

  public static buildAllocationsPayload(loop: UnifiedTradingLoop): DeskAllocationsResponse {
    const nav = loop.riskGate.getNav();
    const alloc = loop.riskGate.getEngineBudgets();
    const cash = loop.riskGate.getCash();
    const drift = verifyZeroDrift(nav, alloc, cash);

    return {
      totalNavUsd: nav,
      unallocatedCashUsd: cash,
      cashBufferRatio: nav > 0 ? cash / nav : 0,
      allocations: alloc,
      allocatedCapitalUsd: alloc,
      driftUsd: drift.driftUsd,
      isZeroDrift: drift.valid,
    };
  }

  public static buildStatus(params: DeskStatusBuilderParams): Record<string, unknown> {
    const { loop, supervisor, config, running, uptimeSeconds, cycleCount, processedOrders } = params;
    const nav = loop.riskGate.getNav();
    const allocated = loop.riskGate.getEngineBudgets() as Record<string, number>;
    const cash = loop.riskGate.getCash();
    const drift = verifyZeroDrift(nav, allocated, cash);
    const supEngines = supervisor.getEngineStatuses();

    const engines: Record<string, DeskStatusEngineEntry> = {};
    for (const [id, s] of Object.entries(supEngines)) {
      engines[id] = {
        status: s.status,
        allocatedCapitalUsd: allocated[id] ?? 0,
        lastSignalTime: s.lastSignalTime,
        error: s.error,
      };
    }

    if (!engines['alpha-lab']) {
      engines['alpha-lab'] = {
        status: running ? 'RUNNING' : 'STOPPED',
        allocatedCapitalUsd: allocated['alpha-lab'] ?? 0,
      };
    }

    return {
      status: running ? loop.getState() : 'STOPPED',
      mode: config.mode,
      capitalUsd: config.capitalUsd,
      dryRun: config.dryRun,
      circuitBreakerTier: loop.riskGate.getTier(),
      navUsd: nav,
      driftUsd: drift.driftUsd,
      uptimeSeconds,
      cycleCount,
      exchanges: [...config.exchanges],
      symbols: [...config.symbols],
      engines,
      isDriftValid: drift.valid,
      queueDepth: loop.queue.size(),
      processedOrders,
      allocatedCapitalUsd: allocated,
      unallocatedCashUsd: cash,
      allocations: {
        allocatedCapitalUsd: allocated,
        unallocatedCashUsd: cash,
        driftUsd: drift.driftUsd,
      },
    };
  }
}
