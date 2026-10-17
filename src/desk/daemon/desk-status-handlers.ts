/**
 * Desk Status Server HTTP Route Handlers & Default Payload Builders
 * Extracted from desk-status-server.ts for modularity and single responsibility.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { sanitizeHttpError } from '../../shared/utils/error-sanitize';
import type { DeskMetricsRegistry } from '../telemetry/desk-metrics-registry';
import type {
  DeskStatusResponse,
  DeskAllocationsResponse,
  IDeskStatusDataProvider,
} from './desk-status-server-types';

export interface DeskStatusRequestContext {
  readonly running: boolean;
  readonly dataProvider?: IDeskStatusDataProvider;
  readonly metricsRegistry: DeskMetricsRegistry;
  getUptimeSeconds(): number;
}

export function sendJson(res: ServerResponse, statusCode: number, data: unknown): void {
  const payload = JSON.stringify(data);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

export function buildDefaultStatusResponse(
  running: boolean,
  uptimeSeconds: number
): DeskStatusResponse {
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

export function buildDefaultAllocationsResponse(): DeskAllocationsResponse {
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

export async function handleDeskStatusHttpRequest(
  req: IncomingMessage,
  res: ServerResponse,
  ctx: DeskStatusRequestContext
): Promise<void> {
  const method = req.method?.toUpperCase() ?? 'GET';
  const rawUrl = req.url ?? '/';
  const pathname = rawUrl.split('?')[0].replace(/\/+$/, '') || '/';

  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
    });
    res.end();
    return;
  }

  try {
    if (method !== 'GET') {
      throw new Error('Resource not found');
    }

    if (pathname === '/health') {
      sendJson(res, 200, {
        status: 'ok',
        uptimeSeconds: ctx.getUptimeSeconds(),
        timestamp: new Date().toISOString(),
      });
      return;
    }

    if (pathname === '/status') {
      const data = ctx.dataProvider?.getStatus
        ? await ctx.dataProvider.getStatus()
        : buildDefaultStatusResponse(ctx.running, ctx.getUptimeSeconds());
      sendJson(res, 200, data);
      return;
    }

    if (pathname === '/api/desk/allocations') {
      const data = ctx.dataProvider?.getAllocations
        ? await ctx.dataProvider.getAllocations()
        : buildDefaultAllocationsResponse();
      sendJson(res, 200, data);
      return;
    }

    if (pathname === '/metrics') {
      const metrics = ctx.dataProvider?.getMetricsText
        ? await ctx.dataProvider.getMetricsText()
        : await ctx.metricsRegistry.getMetricsText();
      res.writeHead(200, {
        'Content-Type': ctx.metricsRegistry.getContentType(),
        'Content-Length': Buffer.byteLength(metrics),
      });
      res.end(metrics);
      return;
    }

    throw new Error('Resource not found');
  } catch (err) {
    const sanitized = sanitizeHttpError(err);
    sendJson(res, sanitized.error.statusCode, sanitized);
  }
}
