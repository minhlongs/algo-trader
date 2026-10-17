/**
 * Desk Daemon Status & Allocations Payload Builder
 *
 * @module desk/daemon/desk-daemon-status-builder
 */

import type { DeskAutoConfig } from '../commands/desk-auto-types';
import type { UnifiedTradingLoop } from '../orchestrator/unified-trading-loop';
import type { IEngineSupervisor } from './engine-supervisor-types';
import type {
  DeskStatusEngineEntry,
  DeskAllocationsResponse,
} from './desk-status-server-types';
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
