/**
 * Co-pilot Routes — Response Structure and Tier Gating Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

const mocks = vi.hoisted(() => ({
  classifyIntent: vi.fn((_q: string) => ({ intent: 'fallback' as const, confidence: 0 })),
  riskHandler: vi.fn(() => ({ answer: '**Risk Assessment**\n- Risk score: 3/10', actions: [] })),
  arbHandler: vi.fn(() => ({ answer: '**Arbitrage Scan Results**', actions: [] })),
  perfHandler: vi.fn(() => ({ answer: '**Strategy Performance**', actions: [] })),
  regimeHandler: vi.fn(() => ({ answer: '**Market Regime**', actions: [] })),
  reportHandler: vi.fn(() => ({ answer: '**Weekly Report**', actions: [] })),
  fallbackHandler: vi.fn(() => ({
    answer: 'I can help with trading questions...',
    actions: [
      { label: 'Risk Assessment', action: 'execute', payload: 'risk_assessment' },
      { label: 'View Positions', action: 'navigate', payload: '/positions' },
    ],
  })),
}));

let testTier = 'PRO';

vi.mock('../../../middleware/feature-gate', () => ({
  requireTier: () => (req: Request, _res: Response, next: NextFunction) => {
    (req as unknown as { license: { id: string; tier: string; status: string } }).license = {
      id: 'test-license',
      tier: testTier,
      status: 'active',
    };
    next();
  },
  canAccessFeature: vi.fn(() => true),
}));

vi.mock('../../../../shared/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('../../../../desk/intelligence/co-pilot/intent-classifier', () => ({
  classifyIntent: mocks.classifyIntent,
  Intent: {},
}));

vi.mock('../../../../desk/intelligence/co-pilot/handlers/risk-handler', () => ({ handleRiskQuery: mocks.riskHandler }));
vi.mock('../../../../desk/intelligence/co-pilot/handlers/arb-handler', () => ({ handleArbQuery: mocks.arbHandler }));
vi.mock('../../../../desk/intelligence/co-pilot/handlers/performance-handler', () => ({ handlePerformanceQuery: mocks.perfHandler }));
vi.mock('../../../../desk/intelligence/co-pilot/handlers/regime-handler', () => ({ handleRegimeQuery: mocks.regimeHandler }));
vi.mock('../../../../desk/intelligence/co-pilot/handlers/report-handler', () => ({ handleReportQuery: mocks.reportHandler }));
vi.mock('../../../../desk/intelligence/co-pilot/handlers/fallback-handler', () => ({ handleFallback: mocks.fallbackHandler }));

import { coPilotRouter, resetCoPilotRateLimiter } from '../co-pilot-routes';

function buildApp(tier = 'PRO') {
  testTier = tier;
  const app = express();
  app.use(express.json());
  app.use(coPilotRouter);
  return app;
}

describe('Co-pilot Routes — Structure & Tier Gating', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetCoPilotRateLimiter();
  });

  it('includes answer, actions, and optional sourceData', async () => {
    mocks.classifyIntent.mockImplementation(() => ({ intent: 'risk_assessment', confidence: 0.8 }));
    const res = await request(buildApp()).post('/api/v1/co-pilot/ask').send({ query: 'what is my risk exposure?' });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('answer');
    expect(res.body).toHaveProperty('actions');
    expect(Array.isArray(res.body.actions)).toBe(true);
  });

  it('each action has label, action type, and optional payload', async () => {
    mocks.classifyIntent.mockImplementation(() => ({ intent: 'fallback', confidence: 0 }));
    const res = await request(buildApp()).post('/api/v1/co-pilot/ask').send({ query: 'unknown query' });
    expect(res.status).toBe(200);
    for (const action of res.body.actions) {
      expect(action).toHaveProperty('label');
      expect(action).toHaveProperty('action');
      expect(['navigate', 'execute', 'toggle']).toContain(action.action);
    }
  });

  it('FREE tier always gets fallback response', async () => {
    mocks.classifyIntent.mockImplementation(() => ({ intent: 'risk_assessment', confidence: 0.9 }));
    const res = await request(buildApp('FREE')).post('/api/v1/co-pilot/ask').send({ query: 'what is my risk exposure?' });
    expect(res.status).toBe(200);
    expect(mocks.fallbackHandler).toHaveBeenCalledTimes(1);
    expect(mocks.riskHandler).not.toHaveBeenCalled();
    expect(res.body).toHaveProperty('answer');
    expect(res.body).toHaveProperty('actions');
    expect(Array.isArray(res.body.actions)).toBe(true);
    expect(res.body.actions.length).toBeGreaterThanOrEqual(1);
  });

  it('PRO tier gets full intent processing', async () => {
    mocks.classifyIntent.mockImplementation(() => ({ intent: 'risk_assessment', confidence: 0.8 }));
    const res = await request(buildApp('PRO')).post('/api/v1/co-pilot/ask').send({ query: 'what is my risk exposure?' });
    expect(res.status).toBe(200);
    expect(mocks.riskHandler).toHaveBeenCalledTimes(1);
    expect(res.body.answer).toContain('Risk Assessment');
  });

  it('STARTER tier gets fallback only (same as FREE)', async () => {
    mocks.classifyIntent.mockImplementation(() => ({ intent: 'arb_scan', confidence: 0.8 }));
    const res = await request(buildApp('STARTER')).post('/api/v1/co-pilot/ask').send({ query: 'find arbitrage' });
    expect(res.status).toBe(200);
    expect(mocks.fallbackHandler).toHaveBeenCalledTimes(1);
    expect(mocks.arbHandler).not.toHaveBeenCalled();
  });

  it('ENTERPRISE tier gets full intent processing', async () => {
    mocks.classifyIntent.mockImplementation(() => ({ intent: 'weekly_report', confidence: 0.9 }));
    const res = await request(buildApp('ENTERPRISE')).post('/api/v1/co-pilot/ask').send({ query: 'generate report' });
    expect(res.status).toBe(200);
    expect(mocks.reportHandler).toHaveBeenCalledTimes(1);
  });
});
