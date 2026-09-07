/**
 * Tests for MCP routes — auth gating, JSON-RPC 2.0 envelope, stub endpoints.
 * Uses createMCPRouter(deps) factory — no module-level side-effects.
 */

import { describe, it, expect, vi } from 'vitest';
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

  // ── resolveTier edge cases ──

  describe('resolveTier', () => {
    it('returns FREE when API key is invalid (gate returns undefined)', async () => {
      const DEPS = {
        gate: { validateApiKey: () => undefined },
        signalTtlEnforcer: { getLive: () => [] },
        filterSignalsForTier: (s: Signal[]) => s,
      };
      const res = await request(buildApp(DEPS))
        .get('/api/mcp/get_signals')
        .set('Authorization', 'Bearer bad-key');
      expect(res.status).toBe(403);
    });

    it('returns FREE when tier is not PRO or ENTERPRISE', async () => {
      const DEPS = {
        gate: { validateApiKey: () => ({ tier: 'FREE' }) },
        signalTtlEnforcer: { getLive: () => [] },
        filterSignalsForTier: (s: Signal[]) => s,
      };
      const res = await request(buildApp(DEPS))
        .get('/api/mcp/get_signals')
        .set('Authorization', 'Bearer free-key');
      expect(res.status).toBe(403);
    });

    it('returns ENTERPRISE tier when license is ENTERPRISE', async () => {
      const DEPS = {
        gate: { validateApiKey: () => ({ tier: 'ENTERPRISE' }) },
        signalTtlEnforcer: { getLive: () => [mockSignal()] },
        filterSignalsForTier: (s: Signal[]) => s,
      };
      const res = await request(buildApp(DEPS))
        .get('/api/mcp/get_signals')
        .set('Authorization', 'Bearer ent-key')
        .query({ since: 0, limit: 10 });
      expect(res.status).toBe(200);
      expect(res.body.result.tier).toBe('ENTERPRISE');
    });
  });

  // ── get_signals: filterSignalsForTier default + catch block ──

  describe('GET /api/mcp/get_signals — filter default + error', () => {
    it('uses identity filter when filterSignalsForTier is omitted', async () => {
      const PRO_DEPS = {
        gate: { validateApiKey: () => ({ tier: 'PRO' }) },
        signalTtlEnforcer: { getLive: () => [mockSignal(), mockSignal({ id: 'sig-002' })] },
        // no filterSignalsForTier — exercises default `(s) => s`
      };
      const res = await request(buildApp(PRO_DEPS))
        .get('/api/mcp/get_signals')
        .set('Authorization', 'Bearer test-key')
        .query({ since: 0, limit: 100 });
      expect(res.status).toBe(200);
      expect(res.body.result.signals.length).toBe(2);
    });

    it('returns 500 when getLive throws (catch block)', async () => {
      const PRO_DEPS = {
        gate: { validateApiKey: () => ({ tier: 'PRO' }) },
        signalTtlEnforcer: { getLive: () => { throw new Error('boom'); } },
        filterSignalsForTier: (s: Signal[]) => s,
      };
      const res = await request(buildApp(PRO_DEPS))
        .get('/api/mcp/get_signals')
        .set('Authorization', 'Bearer test-key');
      expect(res.status).toBe(500);
      expect(res.body.error.code).toBe(-32603);
    });
  });

  // ── get_consensus: full success path ──

  describe('GET /api/mcp/get_consensus — success', () => {
    it('returns 200 stub with valid signal_ids for PRO tier', async () => {
      const PRO_DEPS = {
        gate: { validateApiKey: () => ({ tier: 'PRO' }) },
      };
      const res = await request(buildApp(PRO_DEPS))
        .get('/api/mcp/get_consensus')
        .set('Authorization', 'Bearer pro-key')
        .query({ signal_ids: 'sig-001,sig-002' });
      expect(res.status).toBe(200);
      expect(res.body.result.message).toBe('stub');
      expect(res.body.result.tier).toBe('PRO');
    });

    it('returns 400 when signal_ids missing', async () => {
      const PRO_DEPS = {
        gate: { validateApiKey: () => ({ tier: 'PRO' }) },
      };
      const res = await request(buildApp(PRO_DEPS))
        .get('/api/mcp/get_consensus')
        .set('Authorization', 'Bearer pro-key');
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe(-32602);
    });
  });

  // ── list_strategies: invalid params ──

  describe('GET /api/mcp/list_strategies — invalid params', () => {
    it('returns 400 when min_sharpe is negative', async () => {
      const res = await request(buildApp(FREE_DEPS))
        .get('/api/mcp/list_strategies?min_sharpe=-1');
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe(-32602);
    });
  });

  // ── get_performance: invalid params ──

  describe('GET /api/mcp/get_performance — invalid params', () => {
    it('returns 400 when provider_id is empty string', async () => {
      const res = await request(buildApp(FREE_DEPS))
        .get('/api/mcp/get_performance?provider_id=');
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe(-32602);
    });
  });

  // ── Research provenance routes ──

  describe('GET /api/mcp/list_experiments', () => {
    it('returns parsed JSON on success', async () => {
      const handler = vi.fn().mockResolvedValue({
        isError: false,
        content: [{ type: 'text', text: JSON.stringify({ experiments: [{ id: 'exp-1' }] }) }],
      });
      const DEPS = {
        research: { listExperiments: handler },
      };
      const res = await request(buildApp(DEPS))
        .get('/api/mcp/list_experiments?limit=5');
      expect(res.status).toBe(200);
      expect(res.body.result.experiments[0].id).toBe('exp-1');
      expect(handler).toHaveBeenCalledWith({ limit: 5, apiKey: '' });
    });

    it('returns raw text when content is not valid JSON', async () => {
      const handler = vi.fn().mockResolvedValue({
        isError: false,
        content: [{ type: 'text', text: 'not-json' }],
      });
      const DEPS = {
        research: { listExperiments: handler },
      };
      const res = await request(buildApp(DEPS))
        .get('/api/mcp/list_experiments');
      expect(res.status).toBe(200);
      expect(res.body.result.raw).toBe('not-json');
    });

    it('returns 403 when handler reports isError', async () => {
      const handler = vi.fn().mockResolvedValue({
        isError: true,
        content: [{ type: 'text', text: 'Access denied' }],
      });
      const DEPS = {
        research: { listExperiments: handler },
      };
      const res = await request(buildApp(DEPS))
        .get('/api/mcp/list_experiments');
      expect(res.status).toBe(403);
      expect(res.body.error.message).toBe('Access denied');
    });

    it('returns 400 for invalid limit', async () => {
      const DEPS = {
        research: { listExperiments: vi.fn() },
      };
      const res = await request(buildApp(DEPS))
        .get('/api/mcp/list_experiments?limit=-1');
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe(-32602);
    });
  });

  describe('GET /api/mcp/get_run_card', () => {
    it('returns parsed JSON on success', async () => {
      const handler = vi.fn().mockResolvedValue({
        isError: false,
        content: [{ type: 'text', text: JSON.stringify({ runId: 'run-1', status: 'complete' }) }],
      });
      const DEPS = {
        research: { getRunCard: handler },
      };
      const res = await request(buildApp(DEPS))
        .get('/api/mcp/get_run_card?runId=run-1');
      expect(res.status).toBe(200);
      expect(res.body.result.runId).toBe('run-1');
      expect(handler).toHaveBeenCalledWith({ runId: 'run-1', apiKey: '' });
    });

    it('returns 403 when handler reports isError', async () => {
      const handler = vi.fn().mockResolvedValue({
        isError: true,
        content: [{ type: 'text', text: 'Not found' }],
      });
      const DEPS = {
        research: { getRunCard: handler },
      };
      const res = await request(buildApp(DEPS))
        .get('/api/mcp/get_run_card?runId=run-1');
      expect(res.status).toBe(403);
    });

    it('returns 400 when runId missing', async () => {
      const DEPS = {
        research: { getRunCard: vi.fn() },
      };
      const res = await request(buildApp(DEPS))
        .get('/api/mcp/get_run_card');
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe(-32602);
    });
  });

  describe('GET /api/mcp/get_alpha_report', () => {
    it('returns parsed JSON on success', async () => {
      const handler = vi.fn().mockResolvedValue({
        isError: false,
        content: [{ type: 'text', text: JSON.stringify({ candidateId: 'cand-1', alpha: 0.12 }) }],
      });
      const DEPS = {
        research: { getAlphaReport: handler },
      };
      const res = await request(buildApp(DEPS))
        .get('/api/mcp/get_alpha_report?candidateId=cand-1');
      expect(res.status).toBe(200);
      expect(res.body.result.alpha).toBeCloseTo(0.12, 10);
    });

    it('returns 403 when handler reports isError', async () => {
      const handler = vi.fn().mockResolvedValue({
        isError: true,
        content: [{ type: 'text', text: 'Forbidden' }],
      });
      const DEPS = {
        research: { getAlphaReport: handler },
      };
      const res = await request(buildApp(DEPS))
        .get('/api/mcp/get_alpha_report?candidateId=cand-1');
      expect(res.status).toBe(403);
    });

    it('returns 400 when candidateId missing', async () => {
      const DEPS = {
        research: { getAlphaReport: vi.fn() },
      };
      const res = await request(buildApp(DEPS))
        .get('/api/mcp/get_alpha_report');
      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/mcp/get_backtest_summary', () => {
    it('returns parsed JSON on success', async () => {
      const handler = vi.fn().mockResolvedValue({
        isError: false,
        content: [{ type: 'text', text: JSON.stringify({ runId: 'run-1', sharpe: 1.5 }) }],
      });
      const DEPS = {
        research: { getBacktestSummary: handler },
      };
      const res = await request(buildApp(DEPS))
        .get('/api/mcp/get_backtest_summary?runId=run-1');
      expect(res.status).toBe(200);
      expect(res.body.result.sharpe).toBe(1.5);
    });

    it('returns 403 when handler reports isError', async () => {
      const handler = vi.fn().mockResolvedValue({
        isError: true,
        content: [{ type: 'text', text: 'Error' }],
      });
      const DEPS = {
        research: { getBacktestSummary: handler },
      };
      const res = await request(buildApp(DEPS))
        .get('/api/mcp/get_backtest_summary?runId=run-1');
      expect(res.status).toBe(403);
    });

    it('returns 400 when runId missing', async () => {
      const DEPS = {
        research: { getBacktestSummary: vi.fn() },
      };
      const res = await request(buildApp(DEPS))
        .get('/api/mcp/get_backtest_summary');
      expect(res.status).toBe(400);
    });
  });

  // ── contentText edge cases ──

  describe('contentText edge cases', () => {
    it('returns empty object when content is empty array (text="" → JSON.parse("{}"))', async () => {
      const handler = vi.fn().mockResolvedValue({
        isError: false,
        content: [],
      });
      const DEPS = {
        research: { listExperiments: handler },
      };
      const res = await request(buildApp(DEPS))
        .get('/api/mcp/list_experiments');
      expect(res.status).toBe(200);
      // contentText returns "" → JSON.parse("{}") succeeds → result = {}
      expect(res.body.result).toEqual({});
    });

    it('returns empty object when content item has no text field', async () => {
      const handler = vi.fn().mockResolvedValue({
        isError: false,
        content: [{ type: 'image', data: 'abc' }],
      });
      const DEPS = {
        research: { listExperiments: handler },
      };
      const res = await request(buildApp(DEPS))
        .get('/api/mcp/list_experiments');
      expect(res.status).toBe(200);
      expect(res.body.result).toEqual({});
    });
  });

  // ── extractApiKey via Bearer header in research routes ──

  describe('extractApiKey via research routes', () => {
    it('passes apiKey from Bearer header to handler', async () => {
      const handler = vi.fn().mockResolvedValue({
        isError: false,
        content: [{ type: 'text', text: JSON.stringify({ ok: true }) }],
      });
      const DEPS = {
        research: { getRunCard: handler },
      };
      await request(buildApp(DEPS))
        .get('/api/mcp/get_run_card?runId=r1')
        .set('Authorization', 'Bearer my-api-key-123');
      expect(handler).toHaveBeenCalledWith({ runId: 'r1', apiKey: 'my-api-key-123' });
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
