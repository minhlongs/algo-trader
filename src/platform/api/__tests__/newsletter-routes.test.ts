/**
 * Tests for Newsletter Routes
 * Phase 34 Content Personalization
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

const queryMock = vi.fn().mockResolvedValue({ rows: [] });

vi.mock('../../../shared/db/postgres-client', () => ({
  getDbClient: vi.fn(() => ({
    query: queryMock,
  })),
}));

vi.mock('../../../shared/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('../../middleware/feature-gate', () => ({
  requireTier: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

vi.mock('../../../platform/notifications/email-service', () => ({
  emailService: { send: vi.fn().mockResolvedValue(true) },
}));

import { newsletterRouter } from '../routes/newsletter-routes';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/newsletter', newsletterRouter);
  return app;
}

describe('Newsletter Routes', () => {
  beforeEach(() => {
    queryMock.mockReset();
    queryMock.mockResolvedValue({ rows: [] });
  });

  it('exports the router', () => {
    expect(newsletterRouter).toBeTruthy();
  });

  describe('POST /subscribe', () => {
    it('rejects subscribe without email (400)', async () => {
      const app = buildApp();
      const res = await request(app).post('/api/newsletter/subscribe').send({
        frequency: 'weekly',
      });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation error');
      expect(queryMock).not.toHaveBeenCalled();
    });

    it('rejects invalid email format (400)', async () => {
      const app = buildApp();
      const res = await request(app).post('/api/newsletter/subscribe').send({
        email: 'notanemail',
      });
      expect(res.status).toBe(400);
    });

    it('subscribes with valid email (200)', async () => {
      const app = buildApp();
      const res = await request(app).post('/api/newsletter/subscribe').send({
        email: 'user@example.com',
        frequency: 'daily',
        interests: ['trading', 'signals'],
        topics: 'strategies',
      });
      expect(res.status).toBe(200);
      expect(queryMock).toHaveBeenCalledTimes(1);
      const [sql, params] = queryMock.mock.calls[0];
      expect(sql).toContain('INSERT INTO newsletter_preferences');
      expect(params[0]).toBe('user@example.com');
      expect(params[2]).toBe('daily');
    });

    it('defaults invalid frequency to weekly', async () => {
      const app = buildApp();
      await request(app).post('/api/newsletter/subscribe').send({
        email: 'user@example.com',
        frequency: 'hourly', // invalid
      });
      const params = queryMock.mock.calls[0][1];
      expect(params[2]).toBe('weekly');
    });
  });

  describe('DELETE /unsubscribe', () => {
    it('rejects missing email (400)', async () => {
      const app = buildApp();
      const res = await request(app).delete('/api/newsletter/unsubscribe');
      expect(res.status).toBe(400);
    });

    it('unsubscribes with valid email', async () => {
      const app = buildApp();
      const res = await request(app).delete('/api/newsletter/unsubscribe?email=user@example.com');
      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Unsubscribed');
      const [sql] = queryMock.mock.calls[0];
      expect(sql).toContain('UPDATE newsletter_preferences');
      expect(sql).toContain('subscribed = false');
    });
  });

  describe('GET /preferences', () => {
    it('returns not subscribed when no row exists', async () => {
      const app = buildApp();
      const res = await request(app).get('/api/newsletter/preferences?email=user@example.com');
      expect(res.status).toBe(200);
      expect(res.body.subscribed).toBe(false);
    });

    it('returns stored preferences when subscribed', async () => {
      queryMock.mockResolvedValue({
        rows: [{
          email: 'user@example.com',
          frequency: 'weekly',
          topics: 'all',
          interests: [],
          subscribed: true,
          verified: false,
          created_at: '2026-01-01T00:00:00Z',
        }],
      });
      const app = buildApp();
      const res = await request(app).get('/api/newsletter/preferences?email=user@example.com');
      expect(res.status).toBe(200);
      expect(res.body.frequency).toBe('weekly');
      expect(res.body.subscribed).toBe(true);
    });
  });

  describe('GET /segments', () => {
    it('returns segment breakdown', async () => {
      queryMock.mockResolvedValue({
        rows: [{ frequency: 'weekly', topics: 'all', subscriber_count: 42 }],
      });
      const app = buildApp();
      const res = await request(app).get('/api/newsletter/segments');
      expect(res.status).toBe(200);
      expect(res.body.segments).toHaveLength(1);
      expect(res.body.totalSubscribers).toBe(42);
    });
  });
});
