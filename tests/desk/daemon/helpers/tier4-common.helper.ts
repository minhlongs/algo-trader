/**
 * Tier 4 Workload Shared Helpers
 * HTTP query utilities and payload adapters for Scenario tests
 */

import http from 'node:http';
import type { DeskStatusPayload } from './daemon-server-helper';

export function httpGet(port: number, path: string): Promise<{ status: number; text: string }> {
  return new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${port}${path}`, (res) => {
      let text = '';
      res.on('data', (c) => { text += c; });
      res.on('end', () => resolve({ status: res.statusCode ?? 500, text }));
    }).on('error', reject);
  });
}

export function toPayload(raw: Record<string, unknown>): DeskStatusPayload {
  const alloc = raw.allocations as {
    allocatedCapitalUsd: Record<string, number>;
    unallocatedCashUsd: number;
    driftUsd: number;
  };
  return {
    status: (raw.status as DeskStatusPayload['status']) ?? 'STOPPED',
    mode: (raw.mode as DeskStatusPayload['mode']) ?? 'PAPER',
    circuitBreakerTier: (raw.circuitBreakerTier as DeskStatusPayload['circuitBreakerTier']) ?? 'NORMAL',
    navUsd: Number(raw.navUsd ?? raw.capitalUsd ?? 100_000),
    engines: (raw.engines as Record<string, { status: string; lastSignalTime?: number }>) ?? {},
    allocations: alloc ?? { allocatedCapitalUsd: {}, unallocatedCashUsd: 0, driftUsd: 0 },
  };
}
