/**
 * Newsletter Routes — Integration Tests
 *
 * Tests: POST /subscribe, DELETE /unsubscribe, GET /preferences, GET /segments
 * DB layer is mocked — this tests route glue: validation, error handling, response shapes.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

// Hoist mocks BEFORE any module imports
const mocks = vi.hoisted(() => ({
  dbQuery: vi.fn(),
}));

vi.mock('../../../middleware/feature-gate', () => ({
  requireTier: () => (_req: any, _res: any, next: any) => next(),
}));

vi.mock('../../../../shared/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// Mock getDbClient for DB queries
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

describe('Newsletter Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /subscribe', () => {
    const VALID_BODY = {
      email: 'test@example.com',
      tenantId: 'tenant_001',
      frequency: 'weekly',
      interests: ['signals', 'market-analysis'],
      topics: 'all',
    };

    it('returns 200 and subscription confirmation for valid request', async () => {
      mocks.dbQuery.mockResolvedValue({ rows: [] });
      const app = buildApp();
      const res = await request(app)
        .post('/api/newsletter/subscribe')
        .send(VALID_BODY);

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        message: 'Subscription updated',
        email: 'test@example.com',
        frequency: 'weekly',
        topics: 'all',
      });
    });

    it('returns 400 when email is missing', async () => {
      const app = buildApp();
      const res = await request(app)
        .post('/api/newsletter/subscribe')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation error');
      expect(res.body.message).toContain('email');
    });

    it('returns 400 when email is not a string', async () => {
      const app = buildApp();
      const res = await request(app)
        .post('/api/newsletter/subscribe')
        .send({ email: 12345 });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation error');
    });

    it('returns 400 when email lacks @ symbol', async () => {
      const app = buildApp();
      const res = await request(app)
        .post('/api/newsletter/subscribe')
        .send({ email: 'notanemail' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation error');
    });

    it('defaults to weekly frequency when frequency is invalid', async () => {
      mocks.dbQuery.mockResolvedValue({ rows: [] });
      const app = buildApp();
      const res = await request(app)
        .post('/api/newsletter/subscribe')
        .send({ email: 'test@example.com', frequency: 'yearly' });

      expect(res.status).toBe(200);
      expect(res.body.frequency).toBe('weekly');
    });

    it('defaults to all topics when topics is invalid', async () => {
      mocks.dbQuery.mockResolvedValue({ rows: [] });
      const app = buildApp();
      const res = await request(app)
        .post('/api/newsletter/subscribe')
        .send({ email: 'test@example.com', topics: 'invalid-topic' });

      expect(res.status).toBe(200);
      expect(res.body.topics).toBe('all');
    });

    it('uses provided frequency when valid', async () => {
      mocks.dbQuery.mockResolvedValue({ rows: [] });
      const app = buildApp();
      const res = await request(app)
        .post('/api/newsletter/subscribe')
        .send({ email: 'test@example.com', frequency: 'daily' });

      expect(res.status).toBe(200);
      expect(res.body.frequency).toBe('daily');
    });

    it('trims interests array to max 20 items', async () => {
      mocks.dbQuery.mockResolvedValue({ rows: [] });
      const manyInterests = Array.from({ length: 30 }, (_, i) => `interest-${i}`);
      const app = buildApp();
      const res = await request(app)
        .post('/api/newsletter/subscribe')
        .send({ email: 'test@example.com', interests: manyInterests });

      expect(res.status).toBe(200);
      // The route slices to 20, so the DB query should receive 20 tags
      const insertCall = mocks.dbQuery.mock.calls.find(
        (call: any[]) => call[0]?.includes?.('INSERT INTO newsletter_preferences'),
      );
      expect(insertCall).toBeDefined();
      expect(insertCall[1][3]).toHaveLength(20);
    });

    it('lowercases and trims email before DB insert', async () => {
      mocks.dbQuery.mockResolvedValue({ rows: [] });
      const app = buildApp();
      await request(app)
        .post('/api/newsletter/subscribe')
        .send({ email: '  Test@Example.COM  ' });

      const insertCall = mocks.dbQuery.mock.calls.find(
        (call: any[]) => call[0]?.includes?.('INSERT INTO newsletter_preferences'),
      );
      expect(insertCall).toBeDefined();
      expect(insertCall[1][0]).toBe('test@example.com');
    });

    it('executes INSERT ... ON CONFLICT DO UPDATE query', async () => {
      mocks.dbQuery.mockResolvedValue({ rows: [] });
      const app = buildApp();
      await request(app)
        .post('/api/newsletter/subscribe')
        .send(VALID_BODY);

      expect(mocks.dbQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO newsletter_preferences'),
        expect.arrayContaining([
          'test@example.com',
          'tenant_001',
          'weekly',
          ['signals', 'market-analysis'],
          'all',
        ]),
      );
    });

    it('returns 500 when DB query throws', async () => {
      mocks.dbQuery.mockRejectedValue(new Error('DB connection lost'));
      const app = buildApp();
      const res = await request(app)
        .post('/api/newsletter/subscribe')
        .send(VALID_BODY);

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Internal server error');
    });

    it('handles empty interests array', async () => {
      mocks.dbQuery.mockResolvedValue({ rows: [] });
      const app = buildApp();
      const res = await request(app)
        .post('/api/newsletter/subscribe')
        .send({ email: 'test@example.com', interests: [] });

      expect(res.status).toBe(200);
      const insertCall = mocks.dbQuery.mock.calls.find(
        (call: any[]) => call[0]?.includes?.('INSERT INTO newsletter_preferences'),
      );
      expect(insertCall[1][3]).toEqual([]);
    });

    it('handles non-array interests as empty array', async () => {
      mocks.dbQuery.mockResolvedValue({ rows: [] });
      const app = buildApp();
      const res = await request(app)
        .post('/api/newsletter/subscribe')
        .send({ email: 'test@example.com', interests: 'not-an-array' });

      expect(res.status).toBe(200);
      const insertCall = mocks.dbQuery.mock.calls.find(
        (call: any[]) => call[0]?.includes?.('INSERT INTO newsletter_preferences'),
      );
      expect(insertCall[1][3]).toEqual([]);
    });

    it('sets tenantId to null when not provided', async () => {
      mocks.dbQuery.mockResolvedValue({ rows: [] });
      const app = buildApp();
      await request(app)
        .post('/api/newsletter/subscribe')
        .send({ email: 'test@example.com' });

      const insertCall = mocks.dbQuery.mock.calls.find(
        (call: any[]) => call[0]?.includes?.('INSERT INTO newsletter_preferences'),
      );
      expect(insertCall[1][1]).toBeNull();
    });

    it('accepts valid frequency "none"', async () => {
      mocks.dbQuery.mockResolvedValue({ rows: [] });
      const app = buildApp();
      const res = await request(app)
        .post('/api/newsletter/subscribe')
        .send({ email: 'test@example.com', frequency: 'none' });

      expect(res.status).toBe(200);
      expect(res.body.frequency).toBe('none');
    });

    it('accepts valid topic "signals"', async () => {
      mocks.dbQuery.mockResolvedValue({ rows: [] });
      const app = buildApp();
      const res = await request(app)
        .post('/api/newsletter/subscribe')
        .send({ email: 'test@example.com', topics: 'signals' });

      expect(res.status).toBe(200);
      expect(res.body.topics).toBe('signals');
    });
  });

  describe('DELETE /unsubscribe', () => {
    it('returns 200 and unsubscribes valid email', async () => {
      mocks.dbQuery.mockResolvedValue({ rows: [] });
      const app = buildApp();
      const res = await request(app)
        .delete('/api/newsletter/unsubscribe?email=test@example.com');

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        message: 'Unsubscribed',
        email: 'test@example.com',
      });
    });

    it('returns 400 when email query param is missing', async () => {
      const app = buildApp();
      const res = await request(app).delete('/api/newsletter/unsubscribe');

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation error');
    });

    it('returns 400 when email is empty string', async () => {
      const app = buildApp();
      const res = await request(app).delete('/api/newsletter/unsubscribe?email=');

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation error');
    });

    it('returns 400 when email lacks @ symbol', async () => {
      const app = buildApp();
      const res = await request(app).delete('/api/newsletter/unsubscribe?email=invalid');

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation error');
    });

    it('lowercases and trims email before DB update', async () => {
      mocks.dbQuery.mockResolvedValue({ rows: [] });
      const app = buildApp();
      await request(app).delete('/api/newsletter/unsubscribe?email=  Test@Example.COM  ');

      expect(mocks.dbQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE newsletter_preferences'),
        ['test@example.com'],
      );
    });

    it('executes UPDATE SET subscribed=false query', async () => {
      mocks.dbQuery.mockResolvedValue({ rows: [] });
      const app = buildApp();
      await request(app).delete('/api/newsletter/unsubscribe?email=test@example.com');

      expect(mocks.dbQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE newsletter_preferences SET subscribed = false'),
        ['test@example.com'],
      );
    });

    it('returns 500 when DB query throws', async () => {
      mocks.dbQuery.mockRejectedValue(new Error('DB timeout'));
      const app = buildApp();
      const res = await request(app).delete('/api/newsletter/unsubscribe?email=test@example.com');

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Internal server error');
    });
  });

  describe('GET /preferences', () => {
    const PREFERENCES_ROW = {
      email: 'test@example.com',
      frequency: 'weekly',
      interests: ['signals', 'strategies'],
      topics: 'all',
      subscribed: true,
      verified: false,
      created_at: '2026-07-01T00:00:00Z',
    };

    it('returns 200 with preferences for subscribed email', async () => {
      mocks.dbQuery.mockResolvedValue({ rows: [PREFERENCES_ROW] });
      const app = buildApp();
      const res = await request(app).get('/api/newsletter/preferences?email=test@example.com');

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
      const app = buildApp();
      const res = await request(app).get('/api/newsletter/preferences?email=test@example.com');

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(false);
    });

    it('returns not-subscribed response when email not found', async () => {
      mocks.dbQuery.mockResolvedValue({ rows: [] });
      const app = buildApp();
      const res = await request(app).get('/api/newsletter/preferences?email=unknown@example.com');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        email: 'unknown@example.com',
        subscribed: false,
        message: 'Not subscribed',
      });
    });

    it('returns 400 when email query param is missing', async () => {
      const app = buildApp();
      const res = await request(app).get('/api/newsletter/preferences');

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation error');
    });

    it('returns 400 when email is invalid', async () => {
      const app = buildApp();
      const res = await request(app).get('/api/newsletter/preferences?email=bad');

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation error');
    });

    it('lowercases email before DB query', async () => {
      mocks.dbQuery.mockResolvedValue({ rows: [] });
      const app = buildApp();
      await request(app).get('/api/newsletter/preferences?email=Test@Example.COM');

      expect(mocks.dbQuery).toHaveBeenCalledWith(
        expect.stringContaining('SELECT email'),
        ['test@example.com'],
      );
    });

    it('returns 500 when DB query throws', async () => {
      mocks.dbQuery.mockRejectedValue(new Error('DB unavailable'));
      const app = buildApp();
      const res = await request(app).get('/api/newsletter/preferences?email=test@example.com');

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Internal server error');
    });

    it('handles row with null optional fields', async () => {
      mocks.dbQuery.mockResolvedValue({
        rows: [{
          email: 'test@example.com',
          frequency: null,
          interests: null,
          topics: null,
          subscribed: false,
          verified: false,
          created_at: null,
        }],
      });
      const app = buildApp();
      const res = await request(app).get('/api/newsletter/preferences?email=test@example.com');

      expect(res.status).toBe(200);
      expect(res.body.email).toBe('test@example.com');
    });
  });

  describe('GET /segments', () => {
    const SEGMENT_ROWS = [
      { frequency: 'weekly', topics: 'all', subscriber_count: 150 },
      { frequency: 'daily', topics: 'signals', subscriber_count: 80 },
    ];
    const INTEREST_ROWS = [
      { interest: 'signals', count: 200 },
      { interest: 'strategies', count: 120 },
    ];

    it('returns 200 with segments, topInterests, and totalSubscribers', async () => {
      mocks.dbQuery
        .mockResolvedValueOnce({ rows: SEGMENT_ROWS })
        .mockResolvedValueOnce({ rows: INTEREST_ROWS });
      const app = buildApp();
      const res = await request(app).get('/api/newsletter/segments');

      expect(res.status).toBe(200);
      expect(res.body.segments).toEqual(SEGMENT_ROWS);
      expect(res.body.topInterests).toEqual(INTEREST_ROWS);
      expect(res.body.totalSubscribers).toBe(230);
    });

    it('returns totalSubscribers as 0 when no segments exist', async () => {
      mocks.dbQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });
      const app = buildApp();
      const res = await request(app).get('/api/newsletter/segments');

      expect(res.status).toBe(200);
      expect(res.body.segments).toEqual([]);
      expect(res.body.totalSubscribers).toBe(0);
    });

    it('executes two DB queries: segments GROUP BY and interests unnest', async () => {
      mocks.dbQuery
        .mockResolvedValueOnce({ rows: SEGMENT_ROWS })
        .mockResolvedValueOnce({ rows: INTEREST_ROWS });
      const app = buildApp();
      await request(app).get('/api/newsletter/segments');

      expect(mocks.dbQuery).toHaveBeenCalledTimes(2);
      const [firstCall, secondCall] = mocks.dbQuery.mock.calls;
      expect(firstCall[0]).toContain('GROUP BY frequency, topics');
      expect(secondCall[0]).toContain('unnest(interests)');
    });

    it('returns 500 when first DB query throws', async () => {
      mocks.dbQuery.mockRejectedValueOnce(new Error('DB error'));
      const app = buildApp();
      const res = await request(app).get('/api/newsletter/segments');

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Internal server error');
    });

    it('returns 500 when second DB query throws', async () => {
      mocks.dbQuery
        .mockResolvedValueOnce({ rows: SEGMENT_ROWS })
        .mockRejectedValueOnce(new Error('Second query failed'));
      const app = buildApp();
      const res = await request(app).get('/api/newsletter/segments');

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Internal server error');
    });
  });
});
