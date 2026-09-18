/**
 * Co-pilot Routes — Input Validation and Intent Routing Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

const mocks = vi.hoisted(() => ({
  classifyIntent: vi.fn((_q: string) => ({ intent: 'fallback' as const, confidence: 0 })),
  riskHandler: vi.fn(() => ({ answer: '**Risk Assessment**\n- Risk score: 3/10 (low)', actions: [], sourceData: { riskScore: 3 } })),
  arbHandler: vi.fn(() => ({ answer: '**Arbitrage Scan Results**\n- Spread opportunities: 2', actions: [], sourceData: { spreadsFound: 2 } })),
  perfHandler: vi.fn(() => ({ answer: '**Strategy Performance**\n- Win rate: 65.0%', actions: [], sourceData: { winRate: 0.65 } })),
  regimeHandler: vi.fn(() => ({ answer: '**Market Regime**\n- Regime: ranging', actions: [], sourceData: { regime: 'ranging' } })),
  reportHandler: vi.fn(() => ({ answer: '**Weekly Report**\n- Win rate: 65.0%', actions: [], sourceData: { winRate: 0.65 } })),
  fallbackHandler: vi.fn(() => ({
    answer: 'I can help with these trading questions:\n1. **Risk Assessment**\n2. **Arb Scan**\n3. **Strategy Performance**',
    actions: [
      { label: 'Risk Assessment', action: 'execute', payload: 'risk_assessment' },
      { label: 'Scan Arb', action: 'execute', payload: 'arb_scan' },
      { label: 'Performance', action: 'execute', payload: 'strategy_performance' },
      { label: 'Market Regime', action: 'execute', payload: 'market_regime' },
      { label: 'Generate Report', action: 'execute', payload: 'weekly_report' },
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

describe('Co-pilot Routes — Routing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetCoPilotRateLimiter();
    mocks.classifyIntent.mockImplementation(() => ({ intent: 'fallback' as const, confidence: 0 }));
  });

  it('returns 400 when query is missing', async () => {
    const res = await request(buildApp()).post('/api/v1/co-pilot/ask').send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('query');
  });

  it('returns 400 when query is not a string', async () => {
    const res = await request(buildApp()).post('/api/v1/co-pilot/ask').send({ query: 42 });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('query');
  });

  it('routes risk_assessment intent to risk handler', async () => {
    mocks.classifyIntent.mockImplementation(() => ({ intent: 'risk_assessment', confidence: 0.8 }));
    const res = await request(buildApp()).post('/api/v1/co-pilot/ask').send({ query: "what's my risk exposure?" });
    expect(res.status).toBe(200);
    expect(res.body.answer).toContain('Risk Assessment');
    expect(mocks.riskHandler).toHaveBeenCalledTimes(1);
  });

  it('routes arb_scan intent to arb handler', async () => {
    mocks.classifyIntent.mockImplementation(() => ({ intent: 'arb_scan', confidence: 0.7 }));
    const res = await request(buildApp()).post('/api/v1/co-pilot/ask').send({ query: 'find arb opportunities in Polymarket' });
    expect(res.status).toBe(200);
    expect(res.body.answer).toContain('Arbitrage');
    expect(mocks.arbHandler).toHaveBeenCalledTimes(1);
  });

  it('routes strategy_performance intent to performance handler', async () => {
    mocks.classifyIntent.mockImplementation(() => ({ intent: 'strategy_performance', confidence: 0.75 }));
    const res = await request(buildApp()).post('/api/v1/co-pilot/ask').send({ query: 'how are my strategies doing?' });
    expect(res.status).toBe(200);
    expect(res.body.answer).toContain('Strategy Performance');
    expect(mocks.perfHandler).toHaveBeenCalledTimes(1);
  });

  it('routes market_regime intent to regime handler', async () => {
    mocks.classifyIntent.mockImplementation(() => ({ intent: 'market_regime', confidence: 0.6 }));
    const res = await request(buildApp()).post('/api/v1/co-pilot/ask').send({ query: "what's the market doing right now?" });
    expect(res.status).toBe(200);
    expect(res.body.answer).toContain('Market Regime');
    expect(mocks.regimeHandler).toHaveBeenCalledTimes(1);
  });

  it('routes weekly_report intent to report handler', async () => {
    mocks.classifyIntent.mockImplementation(() => ({ intent: 'weekly_report', confidence: 0.9 }));
    const res = await request(buildApp()).post('/api/v1/co-pilot/ask').send({ query: 'generate a weekly report' });
    expect(res.status).toBe(200);
    expect(res.body.answer).toContain('Weekly Report');
    expect(mocks.reportHandler).toHaveBeenCalledTimes(1);
  });

  it('returns fallback for unrecognized query', async () => {
    const res = await request(buildApp()).post('/api/v1/co-pilot/ask').send({ query: 'who won the game last night?' });
    expect(res.status).toBe(200);
    expect(mocks.fallbackHandler).toHaveBeenCalledTimes(1);
    expect(res.body.answer).toContain('Risk Assessment');
    expect(res.body.actions.length).toBeGreaterThanOrEqual(5);
  });

  it('returns fallback when confidence is below 0.5 threshold', async () => {
    mocks.classifyIntent.mockImplementation(() => ({ intent: 'risk_assessment', confidence: 0.3 }));
    const res = await request(buildApp()).post('/api/v1/co-pilot/ask').send({ query: 'something about markets' });
    expect(res.status).toBe(200);
    expect(mocks.fallbackHandler).toHaveBeenCalledTimes(1);
    expect(mocks.riskHandler).not.toHaveBeenCalled();
  });

  it('passes context to handlers', async () => {
    mocks.classifyIntent.mockImplementation(() => ({ intent: 'strategy_performance', confidence: 0.8 }));
    await request(buildApp()).post('/api/v1/co-pilot/ask').send({ query: 'how are my strategies?', context: { strategyId: 'momentum-v2' } });
    expect(mocks.perfHandler).toHaveBeenCalledWith({ strategyId: 'momentum-v2' });
  });
});
