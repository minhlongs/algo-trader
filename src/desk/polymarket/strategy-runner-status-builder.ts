/**
 * Strategy Runner Status Snapshot Builder
 */

import type { LiveTradingOrchestrator } from './live-trading-orchestrator';
import type { LiveOrderManagerProxy } from './live-order-manager-proxy';

export interface RunnerStatusParams {
  status: 'stopped' | 'running' | 'error';
  strategyName: string;
  executionCount: number;
  trackedTokens: string[];
  orchestrator: LiveTradingOrchestrator;
  proxy: LiveOrderManagerProxy | null;
}

export function buildRunnerStatusSnapshot(params: RunnerStatusParams) {
  return {
    status: params.status,
    strategyName: params.strategyName,
    executionCount: params.executionCount,
    trackedTokens: params.trackedTokens,
    tickCount: params.executionCount,
    mode: params.orchestrator.getMode(),
    positions: params.orchestrator.getPositions(),
    bridgeStats: params.proxy?.getStats().bridgeStats ?? {
      scansCompleted: 0,
      signalsProcessed: 0,
      signalsRejected: 0,
      isScanning: false,
      scannerActive: false,
    },
    proxyStats: {
      ordersPlaced: params.executionCount,
      strategy: params.strategyName,
      ...params.proxy?.getStats(),
    },
  };
}
