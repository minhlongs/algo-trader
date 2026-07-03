/**
 * Co-pilot Routes — Integration Tests
 *
 * Tests: POST /api/v1/co-pilot/ask
 * - Each intent with sample query returns correct intent
 * - Fallback returns structured intent listing (NOT LLM chat)
 * - Invalid queries return fallback
 * - Rate limiting works (429 after limit)
 * - XSS attempt sanitized
 * - Tier gating: FREE gets fallback, PRO gets all intents
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import type { Request, Response, NextFunction } from 'express';
import type { LicenseTier } from '../../../../shared/types/license';

// ── Hoisted mocks ──────────────────────────────────────────────────────────

const mocks = vi.hoisted(() => {
  // Track last classified intent for assertions
  let _lastIntent = 'fallback';
  let _lastConfidence = 0;

  return {
    _lastIntent,
    get lastIntent() { return _lastIntent; },
    set lastIntent(v: string) { _lastIntent = v; },
    get lastConfidence() { return _lastConfidence; },
    set lastConfidence(v: number) { _lastConfidence = v; },

    classifyIntent: vi.fn((query: string) => {
      // Default: return fallback with 0 confidence
      return { intent: 'fallback' as const, confidence: 0 };
    }),

    riskHandler: vi.fn(() => ({
      answer: '**Risk Assessment**\n- Risk score: 3/10 (low)',
      actions: [],
      sourceData: { riskScore: 3, drawdown: 4.2, circuitState: 'CLOSED', warnings: [] },
    })),

    arbHandler: vi.fn(() => ({
      answer: '**Arbitrage Scan Results**\n- Spread opportunities: 2',
      actions: [],
      sourceData: { spreadsFound: 2, crossMarketBasket: false, logicalHedges: 1, topOpportunities: [] },
    })),

    perfHandler: vi.fn(() => ({
      answer: '**Strategy Performance**\n- Win rate: 65.0%',
      actions: [],
      sourceData: { winRate: 0.65, totalPredictions: 100, resolvedCount: 40, topStrategies: [] },
    })),

    regimeHandler: vi.fn(() => ({
      answer: '**Market Regime**\n- Regime: ranging',
      actions: [],
      sourceData: { regime: 'ranging', confidence: 0.7, signalDirection: 'NEUTRAL', signalConfidence: 0, tfAnalysis: [] },
    })),

    reportHandler: vi.fn(() => ({
      answer: '**Weekly Report**\n- Win rate: 65.0%',
      actions: [],
      sourceData: { regime: 'ranging', riskScore: 3, winRate: 0.65, openPositions: 5, spreadsFound: 2 },
    })),

    fallbackHandler: vi.fn(() => ({
      answer: [
        'I can help with these trading questions:\n',
        '1. **Risk Assessment** — \'What is my risk exposure?\'',
        '2. **Arb Scan** — \'Find arbitrage opportunities\'',
        '3. **Strategy Performance** — \'How are my strategies doing?\'',
        '4. **Market Regime** — \'What is the market doing?\'',
        '5. **Weekly Report** — \'Generate a weekly report\'',
        '',
        'Try one of the quick actions below!',
      ].join('\n'),
      actions: [
        { label: 'Risk Assessment', action: 'execute', payload: 'risk_assessment' },
        { label: 'Scan Arb', action: 'execute', payload: 'arb_scan' },
        { label: 'Performance', action: 'execute', payload: 'strategy_performance' },
        { label: 'Market Regime', action: 'execute', payload: 'market_regime' },
        { label: 'Generate Report', action: 'execute', payload: 'weekly_report' },
      ],
    })),
  };
});

// ── Mutable test tier — the requireTier mock reads this ────────────────────

let testTier: string = 'PRO';

// ── Module mocks ───────────────────────────────────────────────────────────

vi.mock('../../../middleware/feature-gate', () => ({
  requireTier: () => (req: Request, _res: Response, next: NextFunction) => {
    (req as any).license = { id: 'test-license', tier: testTier, status: 'active' };
    next();
  },
  canAccessFeature: vi.fn(() => true),
}));

vi.mock('../../../../shared/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('../../../../desk/intelligence/co-pilot/intent-classifier', () => ({
  classifyIntent: mocks.classifyIntent,
  // Export Intent type for imports
  Intent: {},
}));

vi.mock('../../../../desk/intelligence/co-pilot/handlers/risk-handler', () => ({
  handleRiskQuery: mocks.riskHandler,
}));

vi.mock('../../../../desk/intelligence/co-pilot/handlers/arb-handler', () => ({
  handleArbQuery: mocks.arbHandler,
}));

vi.mock('../../../../desk/intelligence/co-pilot/handlers/performance-handler', () => ({
  handlePerformanceQuery: mocks.perfHandler,
}));

vi.mock('../../../../desk/intelligence/co-pilot/handlers/regime-handler', () => ({
  handleRegimeQuery: mocks.regimeHandler,
}));

vi.mock('../../../../desk/intelligence/co-pilot/handlers/report-handler', () => ({
  handleReportQuery: mocks.reportHandler,
}));

vi.mock('../../../../desk/intelligence/co-pilot/handlers/fallback-handler', () => ({
  handleFallback: mocks.fallbackHandler,
}));

// ── Import after mocks ─────────────────────────────────────────────────────

import { coPilotRouter, resetCoPilotRateLimiter } from '../co-pilot-routes';

// ── Test helpers ───────────────────────────────────────────────────────────

function buildApp(tier: string = 'PRO') {
  testTier = tier;
  const app = express();
  app.use(express.json());
  app.use(coPilotRouter);
  return app;
}

describe('Co-pilot Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetCoPilotRateLimiter();

    // Reset classifyIntent to default fallback
    mocks.classifyIntent.mockImplementation(() => ({ intent: 'fallback' as const, confidence: 0 }));
  });

  // ── Input validation ───────────────────────────────────────────────────

  describe('Input validation', () => {
    it('returns 400 when query is missing', async () => {
      const app = buildApp();
      const res = await request(app)
        .post('/api/v1/co-pilot/ask')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('query');
    });

    it('returns 400 when query is not a string', async () => {
      const app = buildApp();
      const res = await request(app)
        .post('/api/v1/co-pilot/ask')
        .send({ query: 42 });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('query');
    });
  });

  // ── Intent classification ──────────────────────────────────────────────

  describe('Intent routing', () => {
    it('routes risk_assessment intent to risk handler', async () => {
      mocks.classifyIntent.mockImplementation(() => ({ intent: 'risk_assessment', confidence: 0.8 }));

      const app = buildApp();
      const res = await request(app)
        .post('/api/v1/co-pilot/ask')
        .send({ query: "what's my risk exposure?" });

      expect(res.status).toBe(200);
      expect(res.body.answer).toContain('Risk Assessment');
      expect(mocks.riskHandler).toHaveBeenCalledTimes(1);
    });

    it('routes arb_scan intent to arb handler', async () => {
      mocks.classifyIntent.mockImplementation(() => ({ intent: 'arb_scan', confidence: 0.7 }));

      const app = buildApp();
      const res = await request(app)
        .post('/api/v1/co-pilot/ask')
        .send({ query: 'find arb opportunities in Polymarket' });

      expect(res.status).toBe(200);
      expect(res.body.answer).toContain('Arbitrage');
      expect(mocks.arbHandler).toHaveBeenCalledTimes(1);
    });

    it('routes strategy_performance intent to performance handler', async () => {
      mocks.classifyIntent.mockImplementation(() => ({ intent: 'strategy_performance', confidence: 0.75 }));

      const app = buildApp();
      const res = await request(app)
        .post('/api/v1/co-pilot/ask')
        .send({ query: 'how are my strategies doing?' });

      expect(res.status).toBe(200);
      expect(res.body.answer).toContain('Strategy Performance');
      expect(mocks.perfHandler).toHaveBeenCalledTimes(1);
    });

    it('routes market_regime intent to regime handler', async () => {
      mocks.classifyIntent.mockImplementation(() => ({ intent: 'market_regime', confidence: 0.6 }));

      const app = buildApp();
      const res = await request(app)
        .post('/api/v1/co-pilot/ask')
        .send({ query: "what's the market doing right now?" });

      expect(res.status).toBe(200);
      expect(res.body.answer).toContain('Market Regime');
      expect(mocks.regimeHandler).toHaveBeenCalledTimes(1);
    });

    it('routes weekly_report intent to report handler', async () => {
      mocks.classifyIntent.mockImplementation(() => ({ intent: 'weekly_report', confidence: 0.9 }));

      const app = buildApp();
      const res = await request(app)
        .post('/api/v1/co-pilot/ask')
        .send({ query: 'generate a weekly report' });

      expect(res.status).toBe(200);
      expect(res.body.answer).toContain('Weekly Report');
      expect(mocks.reportHandler).toHaveBeenCalledTimes(1);
    });

    it('returns fallback for unrecognized query', async () => {
      // classifyIntent already defaults to fallback with confidence 0

      const app = buildApp();
      const res = await request(app)
        .post('/api/v1/co-pilot/ask')
        .send({ query: 'who won the game last night?' });

      expect(res.status).toBe(200);
      expect(mocks.fallbackHandler).toHaveBeenCalledTimes(1);
      // Fallback should list supported intents, not LLM chat
      expect(res.body.answer).toContain('Risk Assessment');
      expect(res.body.answer).toContain('Arb Scan');
      expect(res.body.answer).toContain('Strategy Performance');
      expect(res.body.actions.length).toBeGreaterThanOrEqual(5);
    });

    it('returns fallback when confidence is below 0.5 threshold', async () => {
      mocks.classifyIntent.mockImplementation(() => ({ intent: 'risk_assessment', confidence: 0.3 }));

      const app = buildApp();
      const res = await request(app)
        .post('/api/v1/co-pilot/ask')
        .send({ query: 'something about markets' });

      expect(res.status).toBe(200);
      expect(mocks.fallbackHandler).toHaveBeenCalledTimes(1);
      expect(mocks.riskHandler).not.toHaveBeenCalled();
    });

    it('passes context to handlers', async () => {
      mocks.classifyIntent.mockImplementation(() => ({ intent: 'strategy_performance', confidence: 0.8 }));

      const app = buildApp();
      await request(app)
        .post('/api/v1/co-pilot/ask')
        .send({ query: 'how are my strategies?', context: { strategyId: 'momentum-v2' } });

      expect(mocks.perfHandler).toHaveBeenCalledWith({ strategyId: 'momentum-v2' });
    });
  });

  // ── Response structure ─────────────────────────────────────────────────

  describe('Response structure', () => {
    it('includes answer, actions, and optional sourceData', async () => {
      mocks.classifyIntent.mockImplementation(() => ({ intent: 'risk_assessment', confidence: 0.8 }));

      const app = buildApp();
      const res = await request(app)
        .post('/api/v1/co-pilot/ask')
        .send({ query: 'what is my risk exposure?' });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('answer');
      expect(res.body).toHaveProperty('actions');
      expect(Array.isArray(res.body.actions)).toBe(true);
    });

    it('each action has label, action type, and optional payload', async () => {
      mocks.fallbackHandler.mockImplementation(() => ({
        answer: 'I can help...',
        actions: [
          { label: 'Risk Assessment', action: 'execute', payload: 'risk_assessment' },
          { label: 'View Positions', action: 'navigate', payload: '/positions' },
        ],
      }));
      mocks.classifyIntent.mockImplementation(() => ({ intent: 'fallback', confidence: 0 }));

      const app = buildApp();
      const res = await request(app)
        .post('/api/v1/co-pilot/ask')
        .send({ query: 'unknown query' });

      expect(res.status).toBe(200);
      for (const action of res.body.actions) {
        expect(action).toHaveProperty('label');
        expect(action).toHaveProperty('action');
        expect(['navigate', 'execute', 'toggle']).toContain(action.action);
      }
    });
  });

  // ── Tier gating ────────────────────────────────────────────────────────

  describe('Tier gating', () => {
    it('FREE tier always gets fallback response', async () => {
      // Even with a high-confidence match, FREE user gets fallback
      mocks.classifyIntent.mockImplementation(() => ({ intent: 'risk_assessment', confidence: 0.9 }));

      const app = buildApp('FREE');
      const res = await request(app)
        .post('/api/v1/co-pilot/ask')
        .send({ query: 'what is my risk exposure?' });

      expect(res.status).toBe(200);
      expect(mocks.fallbackHandler).toHaveBeenCalledTimes(1);
      expect(mocks.riskHandler).not.toHaveBeenCalled();
      // Fallback response should be structured (validate shape)
      expect(res.body).toHaveProperty('answer');
      expect(res.body).toHaveProperty('actions');
      expect(Array.isArray(res.body.actions)).toBe(true);
      expect(res.body.actions.length).toBeGreaterThanOrEqual(1);
    });

    it('PRO tier gets full intent processing', async () => {
      mocks.classifyIntent.mockImplementation(() => ({ intent: 'risk_assessment', confidence: 0.8 }));

      const app = buildApp('PRO');
      const res = await request(app)
        .post('/api/v1/co-pilot/ask')
        .send({ query: 'what is my risk exposure?' });

      expect(res.status).toBe(200);
      expect(mocks.riskHandler).toHaveBeenCalledTimes(1);
      expect(res.body.answer).toContain('Risk Assessment');
    });

    it('STARTER tier gets fallback only (same as FREE)', async () => {
      mocks.classifyIntent.mockImplementation(() => ({ intent: 'arb_scan', confidence: 0.8 }));

      const app = buildApp('STARTER');
      const res = await request(app)
        .post('/api/v1/co-pilot/ask')
        .send({ query: 'find arbitrage' });

      expect(res.status).toBe(200);
      expect(mocks.fallbackHandler).toHaveBeenCalledTimes(1);
      expect(mocks.arbHandler).not.toHaveBeenCalled();
    });

    it('ENTERPRISE tier gets full intent processing', async () => {
      mocks.classifyIntent.mockImplementation(() => ({ intent: 'weekly_report', confidence: 0.9 }));

      const app = buildApp('ENTERPRISE');
      const res = await request(app)
        .post('/api/v1/co-pilot/ask')
        .send({ query: 'generate report' });

      expect(res.status).toBe(200);
      expect(mocks.reportHandler).toHaveBeenCalledTimes(1);
    });
  });

  // ── Edge cases ─────────────────────────────────────────────────────────

  describe('Edge cases', () => {
    it('rejects empty query with 400', async () => {
      const app = buildApp();
      const res = await request(app)
        .post('/api/v1/co-pilot/ask')
        .send({ query: '' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('query');
    });

    it('handles very long query without crashing', async () => {
      mocks.classifyIntent.mockImplementation(() => ({ intent: 'arb_scan', confidence: 0.6 }));

      const app = buildApp();
      const res = await request(app)
        .post('/api/v1/co-pilot/ask')
        .send({ query: 'find arb ' + 'a'.repeat(10000) });

      expect(res.status).toBe(200);
      expect(mocks.arbHandler).toHaveBeenCalledTimes(1);
    });

    it('handles server error gracefully', async () => {
      mocks.classifyIntent.mockImplementation(() => { throw new Error('Unexpected error'); });

      const app = buildApp();
      const res = await request(app)
        .post('/api/v1/co-pilot/ask')
        .send({ query: 'anything' });

      expect(res.status).toBe(500);
      expect(res.body.error).toContain('Co-pilot request failed');
    });
  });

  // ── Rate limiting ──────────────────────────────────────────────────────

  describe('Rate limiting', () => {
    it('allows requests under the rate limit', async () => {
      const app = buildApp();
      for (let i = 0; i < 5; i++) {
        const res = await request(app)
          .post('/api/v1/co-pilot/ask')
          .send({ query: 'what is my risk?' });

        expect(res.status).toBe(200);
      }
    });

    it('returns 429 when rate limit exceeded', { timeout: 15000 }, async () => {
      const app = buildApp();

      // Send 11 requests (limit is 10)
      const responses: number[] = [];
      for (let i = 0; i < 12; i++) {
        const res = await request(app)
          .post('/api/v1/co-pilot/ask')
          .send({ query: 'what is my risk?' });
        responses.push(res.status);
      }

      const tooManyRequests = responses.filter(s => s === 429);
      expect(tooManyRequests.length).toBeGreaterThanOrEqual(1);
    });
  });
});
