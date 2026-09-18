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

describe('Newsletter Routes: GET /preferences', () => {
  const PREFERENCES_ROW = {
    email: 'test@example.com',
    frequency: 'weekly',
    interests: ['signals', 'strategies'],
    topics: 'all',
    subscribed: true,
    verified: false,
    created_at: '2026-07-01T00:00:00Z',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 200 with preferences for subscribed email', async () => {
    mocks.dbQuery.mockResolvedValue({ rows: [PREFERENCES_ROW] });
    const res = await request(buildApp()).get('/api/newsletter/preferences?email=test@example.com');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      email: 'test@example.com',
      frequency: 'weekly',
      interests: ['signals', 'strategies'],
      topics: 'all',
      subscribed: true,
      verified: false,
      createdAt: '2026-07-01T00:00:00Z',
    });
  });

  it('returns JSON object, not array', async () => {
    mocks.dbQuery.mockResolvedValue({ rows: [PREFERENCES_ROW] });
    const res = await request(buildApp()).get('/api/newsletter/preferences?email=test@example.com');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(false);
  });

  it('returns not-subscribed response when email not found', async () => {
    mocks.dbQuery.mockResolvedValue({ rows: [] });
    const res = await request(buildApp()).get('/api/newsletter/preferences?email=unknown@example.com');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ email: 'unknown@example.com', subscribed: false, message: 'Not subscribed' });
  });

  it('returns 400 when email query param is missing', async () => {
    const res = await request(buildApp()).get('/api/newsletter/preferences');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation error');
  });

  it('returns 400 when email is invalid', async () => {
    const res = await request(buildApp()).get('/api/newsletter/preferences?email=bad');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation error');
  });

  it('lowercases email before DB query', async () => {
    mocks.dbQuery.mockResolvedValue({ rows: [] });
    await request(buildApp()).get('/api/newsletter/preferences?email=Test@Example.COM');
    expect(mocks.dbQuery).toHaveBeenCalledWith(
      expect.stringContaining('SELECT email'),
      ['test@example.com'],
    );
  });

  it('returns 500 when DB query throws', async () => {
    mocks.dbQuery.mockRejectedValue(new Error('DB unavailable'));
    const res = await request(buildApp()).get('/api/newsletter/preferences?email=test@example.com');
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Internal server error');
  });

  it('handles row with null optional fields', async () => {
    mocks.dbQuery.mockResolvedValue({
      rows: [{ email: 'test@example.com', frequency: null, interests: null, topics: null, subscribed: false, verified: false, created_at: null }],
    });
    const res = await request(buildApp()).get('/api/newsletter/preferences?email=test@example.com');
    expect(res.status).toBe(200);
    expect(res.body.email).toBe('test@example.com');
  });
});
