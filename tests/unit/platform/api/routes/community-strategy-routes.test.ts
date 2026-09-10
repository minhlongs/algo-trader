/**
 * Community Strategy Routes — Integration Tests
 *
 * Covers all four endpoints on the community strategy router:
 * POST /upload, GET /, GET /:id, POST /:id/backtest — success paths,
 * every validation branch (400s), not-found (404), DB failure (500),
 * and the tier-gate denial path. The DB client, requireTier, and logger
 * are mocked via vi.hoisted; BacktestRunner is the REAL pure-math
 * implementation (no network/DB) so the backtest math is exercised too.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

let allowTier = true;

const mocks = vi.hoisted(() => ({
  dbQuery: vi.fn(),
  requireTier: ((minTier: string) => (_req: unknown, res: { status: (c: number) => { json: (b: unknown) => void }; }, next: () => void) => {
    if (allowTier) next();
    else res.status(403).json({ error: 'Insufficient tier' });
  }) as unknown as typeof import('../../../../../src/platform/middleware/feature-gate').requireTier,
  uploadRow: { id: 'cs-1', status: 'pending_review', created_at: '2026-08-30T00:00:00Z' },
  listRow: {
    id: 'cs-1', tenant_id: 't-1', name: 'My Strategy', description: 'd',
    strategy_type: 'polymarket', language: 'typescript', status: 'approved',
    sandbox_status: 'passed', backtest_result: { sharpeRatio: 1.5 }, created_at: '2026-08-01',
  },
  detailRow: {
    id: 'cs-1', tenant_id: 't-1', name: 'My Strategy', description: 'd',
    strategy_type: 'polymarket', language: 'typescript', status: 'approved',
    sandbox_status: 'passed', backtest_result: { sharpeRatio: 1.5 },
    review_notes: 'ok', created_at: '2026-08-01', updated_at: '2026-08-02',
  },
}));

vi.mock('../../../../../src/shared/db/postgres-client', () => ({
  getDbClient: () => ({ query: mocks.dbQuery }),
}));

vi.mock('../../../../../src/platform/middleware/feature-gate', () => ({
  requireTier: mocks.requireTier,
}));

vi.mock('../../../../../src/shared/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { communityStrategyRouter } from '../../../../../src/platform/api/routes/community-strategy-routes';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/community/strategies', communityStrategyRouter);
  return app;
}

const VALID_BODY = {
  tenantId: 't-1',
  name: 'Alpha Strat',
  description: 'desc',
  strategyType: 'polymarket',
  sourceCode: 'const x = 1; // strategy code here',
  language: 'typescript',
};

const VALID_TRADES = [
  { entryTimestamp: 1000, exitTimestamp: 2000, pnlUsd: 50, entryPrice: 0.5, exitPrice: 0.6 },
  { entryTimestamp: 3000, exitTimestamp: 4000, pnlUsd: -20, entryPrice: 0.6, exitPrice: 0.55 },
];

describe('communityStrategyRouter', () => {
  beforeEach(() => {
    mocks.dbQuery.mockReset();
    allowTier = true;
    mocks.dbQuery.mockResolvedValue({ rows: [mocks.detailRow] });
  });

  describe('POST /upload', () => {
    it('returns 201 with the inserted strategy', async () => {
      mocks.dbQuery.mockResolvedValueOnce({ rows: [mocks.uploadRow] });

      const res = await request(buildApp()).post('/api/community/strategies/upload').send(VALID_BODY);

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        id: 'cs-1', name: 'Alpha Strat', status: 'pending_review',
        sandboxStatus: 'pending', createdAt: '2026-08-30T00:00:00Z',
      });
      const [sql, params] = mocks.dbQuery.mock.calls[0]!;
      expect(sql).toContain('INSERT INTO community_strategies');
      expect(params).toEqual(['t-1', 'Alpha Strat', 'desc', 'polymarket', VALID_BODY.sourceCode, 'typescript']);
    });

    it('returns 400 when tenantId, name, or sourceCode is missing', async () => {
      for (const omit of ['tenantId', 'name', 'sourceCode']) {
        const body = { ...VALID_BODY } as Record<string, unknown>;
        delete body[omit];
        const res = await request(buildApp()).post('/api/community/strategies/upload').send(body);
        expect(res.status).toBe(400);
        expect(res.body.message).toBe('tenantId, name, and sourceCode are required');
      }
      expect(mocks.dbQuery).not.toHaveBeenCalled();
    });

    it('returns 400 for a name shorter than 3 or longer than 100 characters', async () => {
      const short = await request(buildApp()).post('/api/community/strategies/upload')
        .send({ ...VALID_BODY, name: 'ab' });
      expect(short.status).toBe(400);
      expect(short.body.message).toBe('name must be 3-100 characters');

      const long = await request(buildApp()).post('/api/community/strategies/upload')
        .send({ ...VALID_BODY, name: 'x'.repeat(101) });
      expect(long.status).toBe(400);
      expect(long.body.message).toBe('name must be 3-100 characters');
    });

    it('returns 400 for sourceCode outside 10-50000 characters', async () => {
      const short = await request(buildApp()).post('/api/community/strategies/upload')
        .send({ ...VALID_BODY, sourceCode: 'short' });
      expect(short.status).toBe(400);
      expect(short.body.message).toBe('sourceCode must be 10-50000 characters');

      const long = await request(buildApp()).post('/api/community/strategies/upload')
        .send({ ...VALID_BODY, sourceCode: 'y'.repeat(50001) });
      expect(long.status).toBe(400);
      expect(long.body.message).toBe('sourceCode must be 10-50000 characters');
    });

    it('returns 400 for a disallowed language and defaults to typescript', async () => {
      const bad = await request(buildApp()).post('/api/community/strategies/upload')
        .send({ ...VALID_BODY, language: 'python' });
      expect(bad.status).toBe(400);
      expect(bad.body.message).toBe('language must be: typescript, javascript');

      // Default language path: no language field → 'typescript'
      mocks.dbQuery.mockResolvedValueOnce({ rows: [mocks.uploadRow] });
      const { language: _omit, ...noLang } = VALID_BODY;
      const ok = await request(buildApp()).post('/api/community/strategies/upload').send(noLang);
      expect(ok.status).toBe(201);
      expect(mocks.dbQuery.mock.calls[0]![1]).toEqual(
        expect.arrayContaining(['typescript']),
      );
    });

    it('returns 400 for a disallowed strategyType and defaults to polymarket', async () => {
      const bad = await request(buildApp()).post('/api/community/strategies/upload')
        .send({ ...VALID_BODY, strategyType: 'forex' });
      expect(bad.status).toBe(400);
      expect(bad.body.message).toBe('strategyType must be: polymarket, cex, dex, custom');

      mocks.dbQuery.mockResolvedValueOnce({ rows: [mocks.uploadRow] });
      const { strategyType: _omit, ...noType } = VALID_BODY;
      const ok = await request(buildApp()).post('/api/community/strategies/upload').send(noType);
      expect(ok.status).toBe(201);
      expect(mocks.dbQuery.mock.calls[0]![1]).toEqual(expect.arrayContaining(['polymarket']));
    });

    it('returns 500 when the DB insert fails', async () => {
      mocks.dbQuery.mockRejectedValueOnce(new Error('db down'));

      const res = await request(buildApp()).post('/api/community/strategies/upload').send(VALID_BODY);
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'Internal server error', message: 'Failed to upload strategy' });
    });
  });

  describe('GET /', () => {
    it('returns 200 with mapped rows and clamps query params', async () => {
      mocks.dbQuery.mockResolvedValueOnce({ rows: [mocks.listRow] });

      const res = await request(buildApp()).get('/api/community/strategies?limit=500&offset=-5');

      expect(res.status).toBe(200);
      expect(res.body.limit).toBe(100); // clamped
      expect(res.body.offset).toBe(0);  // clamped
      expect(res.body.data).toEqual([{
        id: 'cs-1', tenantId: 't-1', name: 'My Strategy', description: 'd',
        strategyType: 'polymarket', language: 'typescript', status: 'approved',
        sandboxStatus: 'passed', hasBacktest: true, createdAt: '2026-08-01',
      }]);
      const [sql] = mocks.dbQuery.mock.calls[0]!;
      expect(sql).toContain("WHERE status = 'approved'");
    });

    it('falls back to default limit/offset for invalid query params', async () => {
      mocks.dbQuery.mockResolvedValueOnce({ rows: [] });

      const res = await request(buildApp()).get('/api/community/strategies?limit=abc&offset=xyz');

      expect(res.status).toBe(200);
      expect(res.body.limit).toBe(20);
      expect(res.body.offset).toBe(0);
      expect(res.body.data).toEqual([]);
    });

    it('maps hasBacktest false when backtest_result is null', async () => {
      mocks.dbQuery.mockResolvedValueOnce({ rows: [{ ...mocks.listRow, backtest_result: null }] });

      const res = await request(buildApp()).get('/api/community/strategies');
      expect(res.status).toBe(200);
      expect(res.body.data[0].hasBacktest).toBe(false);
    });

    it('returns 500 when the DB list fails', async () => {
      mocks.dbQuery.mockRejectedValueOnce(new Error('db down'));

      const res = await request(buildApp()).get('/api/community/strategies');
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'Internal server error', message: 'Failed to list strategies' });
    });
  });

  describe('GET /:id', () => {
    it('returns 200 with the strategy detail', async () => {
      const res = await request(buildApp()).get('/api/community/strategies/cs-1');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        id: 'cs-1', tenantId: 't-1', name: 'My Strategy', description: 'd',
        strategyType: 'polymarket', language: 'typescript', status: 'approved',
        sandboxStatus: 'passed', backtestResult: { sharpeRatio: 1.5 },
        reviewNotes: 'ok', createdAt: '2026-08-01', updatedAt: '2026-08-02',
      });
    });

    it('returns 404 when the strategy does not exist', async () => {
      mocks.dbQuery.mockResolvedValueOnce({ rows: [] });

      const res = await request(buildApp()).get('/api/community/strategies/ghost');
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: 'Not found', message: 'Strategy ghost not found' });
    });

    it('returns 500 when the DB fails', async () => {
      mocks.dbQuery.mockRejectedValueOnce(new Error('db down'));

      const res = await request(buildApp()).get('/api/community/strategies/cs-1');
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'Internal server error', message: 'Failed to get strategy' });
    });
  });

  describe('POST /:id/backtest', () => {
    it('returns 200 with real BacktestRunner metrics and persists the result', async () => {
      // 1st call: existence SELECT. 2nd: UPDATE backtest_result.
      mocks.dbQuery
        .mockResolvedValueOnce({ rows: [{ id: 'cs-1' }] })
        .mockResolvedValueOnce({ rows: [] });

      const res = await request(buildApp())
        .post('/api/community/strategies/cs-1/backtest')
        .send({ trades: VALID_TRADES, config: { initialCapitalUsd: 1000 } });

      expect(res.status).toBe(200);
      expect(res.body.strategyId).toBe('cs-1');
      expect(res.body.totalTrades).toBe(2);
      expect(res.body.winningTrades).toBe(1);
      expect(res.body.losingTrades).toBe(1);
      expect(res.body.winRate).toBe(0.5);
      expect(res.body.totalPnlUsd).toBe(30);
      expect(typeof res.body.sharpeRatio).toBe('number');
      expect(res.body.createdAt).toBeTruthy();

      const updateCall = mocks.dbQuery.mock.calls[1]!;
      expect(updateCall[0]).toContain("SET backtest_result = $2, sandbox_status = 'passed'");
      const persisted = JSON.parse(updateCall[1][1] as string) as Record<string, unknown>;
      expect(persisted.totalPnlUsd).toBe(30);
      expect(persisted.sandboxStatus ?? persisted.totalTrades).toBeTruthy();
    });

    it('returns 400 when trades is missing, not an array, or empty', async () => {
      for (const trades of [undefined, 'nope', []]) {
        const res = await request(buildApp())
          .post('/api/community/strategies/cs-1/backtest')
          .send({ trades });
        expect(res.status).toBe(400);
        expect(res.body.message).toBe('trades array is required and must be non-empty');
      }
      expect(mocks.dbQuery).not.toHaveBeenCalled();
    });

    it('returns 400 when a trade is missing required numeric fields', async () => {
      const res = await request(buildApp())
        .post('/api/community/strategies/cs-1/backtest')
        .send({ trades: [{ entryTimestamp: 1000, exitTimestamp: 2000, pnlUsd: 5, entryPrice: 0.5 }] });
      expect(res.status).toBe(400);
      expect(res.body.message).toBe('Each trade must have entryTimestamp, exitTimestamp, pnlUsd, entryPrice, exitPrice');
    });

    it('returns 404 when the strategy does not exist', async () => {
      mocks.dbQuery.mockResolvedValueOnce({ rows: [] });

      const res = await request(buildApp())
        .post('/api/community/strategies/ghost/backtest')
        .send({ trades: VALID_TRADES });
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: 'Not found', message: 'Strategy ghost not found' });
    });

    it('returns 500 when the persistence update fails', async () => {
      mocks.dbQuery
        .mockResolvedValueOnce({ rows: [{ id: 'cs-1' }] })
        .mockRejectedValueOnce(new Error('db down'));

      const res = await request(buildApp())
        .post('/api/community/strategies/cs-1/backtest')
        .send({ trades: VALID_TRADES });
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'Internal server error', message: 'Failed to run backtest' });
    });
  });

  describe('tier gate', () => {
    it('blocks the request when the tier gate denies access', async () => {
      allowTier = false;

      const res = await request(buildApp()).post('/api/community/strategies/upload').send(VALID_BODY);
      expect(res.status).toBe(403);
      expect(mocks.dbQuery).not.toHaveBeenCalled();
    });
  });
});
