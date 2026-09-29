/**
 * DESK:STATUS Command — Autonomous Desk Real-Time Status Inspector
 *
 * Queries the embedded HTTP status server for the autonomous desk daemon
 * and outputs either a formatted human-readable summary or raw JSON telemetry.
 */

import { logger } from '../../shared/utils/logger';

export interface DeskStatusOptions {
  port?: number;
  json?: boolean;
  host?: string;
  fetchFn?: typeof fetch;
}

export interface DeskStatusEngineSummary {
  status?: string;
  lastSignalTime?: number;
  activeOrders?: number;
  [key: string]: unknown;
}

export interface DeskStatusPayload {
  status?: string;
  mode?: string;
  circuitBreakerTier?: string;
  navUsd?: number;
  allocatedCapitalUsd?: Record<string, number>;
  unallocatedCashUsd?: number;
  driftUsd?: number;
  uptimeSeconds?: number;
  cycleCount?: number;
  engines?: Record<string, DeskStatusEngineSummary>;
  [key: string]: unknown;
}

export interface DeskStatusResult {
  ok: boolean;
  url: string;
  data?: DeskStatusPayload;
  error?: string;
}

/**
 * Formats structured desk status payload into terminal-friendly presentation.
 */
export function formatHumanReadableDeskStatus(data: DeskStatusPayload, port: number): void {
  logger.info('\n⚡ Autonomous Desk Status');
  logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  logger.info(`  Server Endpoint:    http://127.0.0.1:${port}/status`);
  logger.info(`  Daemon State:       ${data.status ?? 'UNKNOWN'}`);
  logger.info(`  Execution Mode:     ${data.mode ?? 'UNKNOWN'}`);
  logger.info(`  Circuit Breaker:    ${data.circuitBreakerTier ?? 'NORMAL'}`);
  logger.info(`  Portfolio NAV:      $${(data.navUsd ?? 0).toLocaleString()}`);
  logger.info(`  Daemon Uptime:      ${data.uptimeSeconds ?? 0}s`);

  if (data.driftUsd !== undefined) {
    logger.info(`  Accounting Drift:   $${data.driftUsd.toFixed(6)}`);
  }

  if (data.engines && Object.keys(data.engines).length > 0) {
    logger.info('  Trading Engines:');
    for (const [engineName, info] of Object.entries(data.engines)) {
      const state = info?.status ?? 'UNKNOWN';
      logger.info(`    • ${engineName}: ${state}`);
    }
  }

  logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

/**
 * Main entry point for `desk:status` CLI command.
 */
export async function runDeskStatus(options: DeskStatusOptions = {}): Promise<DeskStatusResult> {
  const host = options.host ?? '127.0.0.1';
  const port = options.port ?? 9100;
  const isJson = options.json ?? false;
  const fetchImpl = options.fetchFn ?? fetch;
  const url = `http://${host}:${port}/status`;

  try {
    const response = await fetchImpl(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      const errorMsg = `HTTP ${response.status} ${response.statusText}`;
      logger.error(`[DeskStatus] Server returned error response: ${errorMsg}`);
      return { ok: false, url, error: errorMsg };
    }

    const data = (await response.json()) as DeskStatusPayload;

    if (isJson) {
      logger.info(JSON.stringify(data, null, 2));
    } else {
      formatHumanReadableDeskStatus(data, port);
    }

    return { ok: true, url, data };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`[DeskStatus] Failed to connect to desk daemon at ${url}: ${message}. Is desk:auto running?`);
    return { ok: false, url, error: message };
  }
}
