/**
 * Desk Status Server Unit & Integration Test Suite
 * Milestone M4: Telemetry & HTTP Status Server
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DeskStatusServer } from '../../../src/desk/daemon/desk-status-server';
import {
  DeskHealthResponseSchema,
  DeskStatusResponseSchema,
  DeskAllocationsResponseSchema,
  type IDeskStatusDataProvider,
} from '../../../src/desk/daemon/desk-status-server-types';

describe('DeskStatusServer HTTP Suite', () => {
  let server: DeskStatusServer;

  beforeEach(() => {
    // Port 0 gives ephemeral port isolation
    server = new DeskStatusServer({ port: 0 });
  });

  afterEach(async () => {
    if (server.isRunning()) {
      await server.stop();
    }
  });

  it('starts on ephemeral port 0 and discovers actual bound port', async () => {
    expect(server.isRunning()).toBe(false);
    await server.start();
    expect(server.isRunning()).toBe(true);
    expect(server.getPort()).toBeGreaterThan(0);
    expect(server.getUrl()).toBe(`http://127.0.0.1:${server.getPort()}`);

    // Idempotent start
    await server.start();
    expect(server.isRunning()).toBe(true);
  });

  it('serves GET /health with valid schema and uptime', async () => {
    await server.start();
    const res = await fetch(`${server.getUrl()}/health`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/json');

    const body: unknown = await res.json();
    const parsed = DeskHealthResponseSchema.parse(body);
    expect(parsed.status).toBe('ok');
    expect(parsed.uptimeSeconds).toBeGreaterThanOrEqual(0);
    expect(new Date(parsed.timestamp).getTime()).toBeGreaterThan(0);
  });

  it('serves GET /status with default desk execution state', async () => {
    await server.start();
    const res = await fetch(`${server.getUrl()}/status`);
    expect(res.status).toBe(200);

    const body: unknown = await res.json();
    const parsed = DeskStatusResponseSchema.parse(body);
    expect(parsed.status).toBe('RUNNING');
    expect(parsed.mode).toBe('PAPER');
    expect(parsed.circuitBreakerTier).toBe('NORMAL');
    expect(parsed.driftUsd).toBe(0);
    expect(parsed.engines.arbitrage.status).toBe('STOPPED');
  });

  it('serves GET /api/desk/allocations with default balance state', async () => {
    await server.start();
    const res = await fetch(`${server.getUrl()}/api/desk/allocations`);
    expect(res.status).toBe(200);

    const body: unknown = await res.json();
    const parsed = DeskAllocationsResponseSchema.parse(body);
    expect(parsed.totalNavUsd).toBe(0);
    expect(parsed.unallocatedCashUsd).toBe(0);
    expect(parsed.cashBufferRatio).toBe(1.0);
    expect(parsed.isZeroDrift).toBe(true);
  });

  it('serves GET /metrics in Prometheus exposition format', async () => {
    server.metricsRegistry.setEngineAllocatedCapital('arbitrage', 35000);
    server.metricsRegistry.setPriorityQueueDepth(5);
    await server.start();

    const res = await fetch(`${server.getUrl()}/metrics`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/plain');

    const text = await res.text();
    expect(text).toContain('desk_engine_allocated_capital_usd{engine="arbitrage"} 35000');
    expect(text).toContain('desk_priority_queue_depth 5');
    expect(text).toContain('desk_zero_drift_compliant 1');
  });

  it('integrates with custom IDeskStatusDataProvider', async () => {
    const customProvider: IDeskStatusDataProvider = {
      getUptimeSeconds: () => 3600,
      getStatus: () => ({
        status: 'RUNNING',
        mode: 'LIVE',
        circuitBreakerTier: 'ALERT',
        navUsd: 250_000,
        driftUsd: 0.000005,
        engines: {
          arbitrage: { status: 'ACTIVE', allocatedCapitalUsd: 50_000 },
          marl: { status: 'ACTIVE', allocatedCapitalUsd: 50_000 },
          amm: { status: 'ACTIVE', allocatedCapitalUsd: 50_000 },
          'alpha-lab': { status: 'ACTIVE', allocatedCapitalUsd: 50_000 },
        },
      }),
      getAllocations: () => ({
        totalNavUsd: 250_000,
        unallocatedCashUsd: 50_000,
        cashBufferRatio: 0.20,
        allocations: { arbitrage: 50_000, marl: 50_000, amm: 50_000, 'alpha-lab': 50_000 },
        driftUsd: 0.000005,
        isZeroDrift: true,
      }),
    };

    const customServer = new DeskStatusServer({ port: 0, dataProvider: customProvider });
    await customServer.start();

    try {
      const statusRes = await fetch(`${customServer.getUrl()}/status`);
      const statusData = DeskStatusResponseSchema.parse(await statusRes.json());
      expect(statusData.mode).toBe('LIVE');
      expect(statusData.circuitBreakerTier).toBe('ALERT');
      expect(statusData.navUsd).toBe(250_000);

      const allocRes = await fetch(`${customServer.getUrl()}/api/desk/allocations`);
      const allocData = DeskAllocationsResponseSchema.parse(await allocRes.json());
      expect(allocData.cashBufferRatio).toBe(0.20);
      expect(allocData.allocations.arbitrage).toBe(50_000);
    } finally {
      await customServer.stop();
    }
  });

  it('handles unmatched routes and returns 404 with sanitized error', async () => {
    await server.start();
    const res = await fetch(`${server.getUrl()}/nonexistent-path`);
    expect(res.status).toBe(404);

    const data = (await res.json()) as { error: { message: string; code: string; statusCode: number } };
    expect(data.error.message).toBe('Resource not found');
    expect(data.error.code).toBe('NOT_FOUND');
    expect(data.error.statusCode).toBe(404);
  });

  it('sanitizes unexpected exceptions without leaking stacks (Rule H4)', async () => {
    const faultyProvider: IDeskStatusDataProvider = {
      getStatus: () => {
        throw new Error('Database connection failed at /Users/secret/file.ts with password=supersecret');
      },
    };

    const errorServer = new DeskStatusServer({ port: 0, dataProvider: faultyProvider });
    await errorServer.start();

    try {
      const res = await fetch(`${errorServer.getUrl()}/status`);
      expect(res.status).toBe(500);

      const data = (await res.json()) as { error: { message: string; code: string; statusCode: number } };
      expect(data.error.statusCode).toBe(500);
      // Ensure sensitive patterns are not leaked
      expect(JSON.stringify(data)).not.toContain('/Users/secret');
      expect(JSON.stringify(data)).not.toContain('supersecret');
    } finally {
      await errorServer.stop();
    }
  });

  it('handles OPTIONS preflight requests cleanly', async () => {
    await server.start();
    const res = await fetch(`${server.getUrl()}/health`, { method: 'OPTIONS' });
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-methods')).toContain('GET');
  });

  it('stops cleanly and idempotently', async () => {
    await server.start();
    expect(server.isRunning()).toBe(true);

    await server.stop();
    expect(server.isRunning()).toBe(false);

    // Idempotent stop
    await server.stop();
    expect(server.isRunning()).toBe(false);
  });
});
