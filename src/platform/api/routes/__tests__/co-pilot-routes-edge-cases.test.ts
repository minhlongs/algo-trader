/**
 * Co-pilot Routes — Edge Cases and Rate Limiting Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

const mocks = vi.hoisted(() => ({
  classifyIntent: vi.fn((_q: string) => ({ intent: 'fallback' as const, confidence: 0 })),
  riskHandler: vi.fn(() => ({ answer: '**Risk Assessment**', actions: [] })),
  arbHandler: vi.fn(() => ({ answer: '**Arbitrage Scan Results**', actions: [] })),
  fallbackHandler: vi.fn(() => ({ answer: 'fallback', actions: [] })),
}));

vi.mock('../../../middleware/feature-gate', () => ({
  requireTier: () => (req: Request, _res: Response, next: NextFunction) => {
    (req as unknown as { license: { id: string; tier: string; status: string } }).license = {
      id: 'test-license',
      tier: 'PRO',
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
vi.mock('../../../../desk/intelligence/co-pilot/handlers/fallback-handler', () => ({ handleFallback: mocks.fallbackHandler }));

import { coPilotRouter, resetCoPilotRateLimiter } from '../co-pilot-routes';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(coPilotRouter);
  return app;
}

describe('Co-pilot Routes — Edge Cases & Rate Limiting', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetCoPilotRateLimiter();
    mocks.classifyIntent.mockImplementation(() => ({ intent: 'fallback' as const, confidence: 0 }));
  });

  it('rejects empty query with 400', async () => {
    const res = await request(buildApp()).post('/api/v1/co-pilot/ask').send({ query: '' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('query');
  });

  it('handles very long query without crashing', async () => {
    mocks.classifyIntent.mockImplementation(() => ({ intent: 'arb_scan', confidence: 0.6 }));
    const res = await request(buildApp())
      .post('/api/v1/co-pilot/ask')
      .send({ query: 'find arb ' + 'a'.repeat(10000) });
    expect(res.status).toBe(200);
    expect(mocks.arbHandler).toHaveBeenCalledTimes(1);
  });

  it('handles server error gracefully', async () => {
    mocks.classifyIntent.mockImplementation(() => { throw new Error('Unexpected error'); });
    const res = await request(buildApp()).post('/api/v1/co-pilot/ask').send({ query: 'anything' });
    expect(res.status).toBe(500);
    expect(res.body.error).toContain('Co-pilot request failed');
  });

  it('allows requests under the rate limit', async () => {
    const app = buildApp();
    for (let i = 0; i < 5; i++) {
      const res = await request(app).post('/api/v1/co-pilot/ask').send({ query: 'what is my risk?' });
      expect(res.status).toBe(200);
    }
  });

  it('returns 429 when rate limit exceeded', { timeout: 15000 }, async () => {
    const app = buildApp();
    const responses: number[] = [];
    for (let i = 0; i < 12; i++) {
      const res = await request(app).post('/api/v1/co-pilot/ask').send({ query: 'what is my risk?' });
      responses.push(res.status);
    }
    const tooManyRequests = responses.filter((s) => s === 429);
    expect(tooManyRequests.length).toBeGreaterThanOrEqual(1);
  });
});
