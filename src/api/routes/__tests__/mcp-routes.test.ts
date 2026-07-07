/**
 * Tests for MCP routes — auth gating, JSON-RPC 2.0 envelope, stub endpoints.
 * Uses createMCPRouter(deps) factory — no module-level side-effects.
 */

import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createMCPRouter } from '../mcp-routes';
import type { Signal } from '../../signal/signal-types';

function buildApp(deps: Parameters<typeof createMCPRouter>[0] = {}): express.Express {
  return express().use(express.json()).use('/api/mcp', createMCPRouter(deps));
}

function mockSignal(overrides: Partial<Signal> = {}): Signal {
  return {
    id: 'sig-001',
    ts: Date.now() - 1000,
    market: 'BTC-USD',
    side: 'BUY',
    size: 0.8,
    confidence: 0.85,
    strategy: 'test-momentum-v1',
    ttl: 300,
    expiresAt: Date.now() + 299_000,
    ...overrides,
  };
}

const FREE_DEPS = {
  gate: { validateApiKey: () => undefined },
  sseBroadcaster: { subscribe: () => {} },
  signalTtlEnforcer: { getLive: () => [] },
  filterSignalsForTier: (s: Signal[]) => s,
};

describe('MCP routes', () => {
  describe('GET /api/mcp/get_signals', () => {
    it('returns 403 without API key (FREE tier)', async () => {
      const res = await request(buildApp(FREE_DEPS)).get('/api/mcp/get_signals');
      expect(res.status).toBe(403);
      expect(res.body.jsonrpc).toBe('2.0');
      expect(res.body.error.code).toBe(-32001);
      expect(res.body.error.message).toContain('PRO+');
    });

    it('returns 200 with signals for PRO tier', async () => {
      const PRO_DEPS = {
        gate: { validateApiKey: () => ({ tier: 'PRO', key: 'test-key' }) as { tier: string } },
        signalTtlEnforcer: { getLive: () => [mockSignal()] },
        filterSignalsForTier: (s: Signal[]) => s,
      };
      const res = await request(buildApp(PRO_DEPS))
        .get('/api/mcp/get_signals')
        .set('Authorization', 'Bearer test-key')
        .query({ since: 0, limit: 20 });
      expect(res.status).toBe(200);
      expect(res.body.result.tier).toBe('PRO');
      expect(Array.isArray(res.body.result.signals)).toBe(true);
    });

    it('returns 400 for invalid query params', async () => {
      const PRO_DEPS = {
        gate: { validateApiKey: () => ({ tier: 'PRO', key: 'test-key' }) as { tier: string } },
        signalTtlEnforcer: { getLive: () => [] },
        filterSignalsForTier: (s: Signal[]) => s,
      };
      const res = await request(buildApp(PRO_DEPS))
        .get('/api/mcp/get_signals')
        .set('Authorization', 'Bearer test-key')
        .query({ since: '-1' });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe(-32602);
    });
  });

  describe('GET /api/mcp/subscribe (SSE)', () => {
    it('returns 403 without API key (FREE)', async () => {
      const res = await request(buildApp(FREE_DEPS)).get('/api/mcp/subscribe');
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe(-32001);
    });

    it('accepts PRO tier connection', async () => {
      const PRO_DEPS = {
        gate: { validateApiKey: () => ({ tier: 'PRO', key: 'test-key' }) as { tier: string } },
        // subscribe must end res immediately so supertest doesn't hang
        sseBroadcaster: { subscribe: (res: express.Response) => { res.status(200).end(); } },
      };
      const res = await request(buildApp(PRO_DEPS))
        .get('/api/mcp/subscribe')
        .set('Authorization', 'Bearer test-key');
      expect(res.status).toBe(200);
    }, 3000);
  });

  describe('GET /api/mcp/check_track_record — public', () => {
    it('returns 400 without provider_id', async () => {
      const res = await request(buildApp(FREE_DEPS)).get('/api/mcp/check_track_record');
      expect(res.status).toBe(400);
    });

    it('returns 200 stub with valid provider_id', async () => {
      const res = await request(buildApp(FREE_DEPS)).get('/api/mcp/check_track_record?provider_id=prov-0001');
      expect(res.status).toBe(200);
      expect(res.body.result.provider_id).toBe('prov-0001');
      expect(res.body.result.message).toContain('stub');
    });
  });

  describe('GET /api/mcp/get_consensus — tier gated', () => {
    it('returns 403 without API key', async () => {
      const res = await request(buildApp(FREE_DEPS)).get('/api/mcp/get_consensus');
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe(-32001);
    });
  });

  describe('GET /api/mcp/list_strategies — public', () => {
    it('returns 200 without auth', async () => {
      const res = await request(buildApp(FREE_DEPS)).get('/api/mcp/list_strategies?category=momentum');
      expect(res.status).toBe(200);
      expect(res.body.result.strategies).toEqual([]);
    });
  });

  describe('GET /api/mcp/get_performance — public', () => {
    it('returns 200 with valid params', async () => {
      const res = await request(buildApp(FREE_DEPS)).get('/api/mcp/get_performance?provider_id=prov-0001&period=7d');
      expect(res.status).toBe(200);
      expect(res.body.result.provider_id).toBe('prov-0001');
      expect(res.body.result.period).toBe('7d');
    });

    it('returns 400 without provider_id', async () => {
      const res = await request(buildApp(FREE_DEPS)).get('/api/mcp/get_performance');
      expect(res.status).toBe(400);
    });
  });

  describe('unknown MCP path', () => {
    it('returns -32601 method-not-found', async () => {
      const res = await request(buildApp(FREE_DEPS)).get('/api/mcp/does_not_exist');
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe(-32601);
      expect(res.body.error.message).toBe('Method not found');
    });
  });
});
