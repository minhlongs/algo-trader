import type { ServerResponse } from 'node:http';
import type {
  DeskStatusResponse,
  DeskAllocationsResponse,
} from './desk-status-server-types';

export function sendStatusJson(res: ServerResponse, statusCode: number, data: unknown): void {
  const payload = JSON.stringify(data);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

export function buildDefaultDeskStatus(running: boolean, uptimeSeconds: number): DeskStatusResponse {
  return {
    status: running ? 'RUNNING' : 'STOPPED',
    mode: 'PAPER',
    circuitBreakerTier: 'NORMAL',
    navUsd: 0,
    driftUsd: 0,
    engines: {
      arbitrage: { status: 'STOPPED', allocatedCapitalUsd: 0 },
      marl: { status: 'STOPPED', allocatedCapitalUsd: 0 },
      amm: { status: 'STOPPED', allocatedCapitalUsd: 0 },
      'alpha-lab': { status: 'STOPPED', allocatedCapitalUsd: 0 },
    },
    uptimeSeconds,
    cycleCount: 0,
  };
}

export function buildDefaultDeskAllocations(): DeskAllocationsResponse {
  const allocations = { arbitrage: 0, marl: 0, amm: 0, 'alpha-lab': 0 };
  return {
    totalNavUsd: 0,
    unallocatedCashUsd: 0,
    cashBufferRatio: 1.0,
    allocations,
    allocatedCapitalUsd: allocations,
    driftUsd: 0,
    isZeroDrift: true,
  };
}
