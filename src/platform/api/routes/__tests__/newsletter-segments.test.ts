import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

const mocks = vi.hoisted(() => ({
  dbQuery: vi.fn(),
}));

vi.mock('../../../middleware/feature-gate', () => ({
  requireTier: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

vi.mock('../../../../shared/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('../../../../shared/db/postgres-client', () => ({
  getDbClient: () => ({ query: mocks.dbQuery }),
}));

import { newsletterRouter } from '../newsletter-routes';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/newsletter', newsletterRouter);
  return app;
}

describe('Newsletter Routes: GET /segments', () => {
  const SEGMENT_ROWS = [
    { frequency: 'weekly', topics: 'all', subscriber_count: 150 },
    { frequency: 'daily', topics: 'signals', subscriber_count: 80 },
  ];
  const INTEREST_ROWS = [
    { interest: 'signals', count: 200 },
    { interest: 'strategies', count: 120 },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 200 with segments, topInterests, and totalSubscribers', async () => {
    mocks.dbQuery
      .mockResolvedValueOnce({ rows: SEGMENT_ROWS })
      .mockResolvedValueOnce({ rows: INTEREST_ROWS });
    const res = await request(buildApp()).get('/api/newsletter/segments');
    expect(res.status).toBe(200);
    expect(res.body.segments).toEqual(SEGMENT_ROWS);
    expect(res.body.topInterests).toEqual(INTEREST_ROWS);
    expect(res.body.totalSubscribers).toBe(230);
  });

  it('returns totalSubscribers as 0 when no segments exist', async () => {
    mocks.dbQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    const res = await request(buildApp()).get('/api/newsletter/segments');
    expect(res.status).toBe(200);
    expect(res.body.segments).toEqual([]);
    expect(res.body.totalSubscribers).toBe(0);
  });

  it('executes two DB queries: segments GROUP BY and interests unnest', async () => {
    mocks.dbQuery
      .mockResolvedValueOnce({ rows: SEGMENT_ROWS })
      .mockResolvedValueOnce({ rows: INTEREST_ROWS });
    await request(buildApp()).get('/api/newsletter/segments');
    expect(mocks.dbQuery).toHaveBeenCalledTimes(2);
    const [firstCall, secondCall] = mocks.dbQuery.mock.calls;
    expect(firstCall[0]).toContain('GROUP BY frequency, topics');
    expect(secondCall[0]).toContain('unnest(interests)');
  });

  it('returns 500 when first DB query throws', async () => {
    mocks.dbQuery.mockRejectedValueOnce(new Error('DB error'));
    const res = await request(buildApp()).get('/api/newsletter/segments');
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Internal server error');
  });

  it('returns 500 when second DB query throws', async () => {
    mocks.dbQuery
      .mockResolvedValueOnce({ rows: SEGMENT_ROWS })
      .mockRejectedValueOnce(new Error('Second query failed'));
    const res = await request(buildApp()).get('/api/newsletter/segments');
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Internal server error');
  });
});
