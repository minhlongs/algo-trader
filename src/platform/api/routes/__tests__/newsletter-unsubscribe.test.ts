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

describe('Newsletter Routes: DELETE /unsubscribe', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 200 and unsubscribes valid email', async () => {
    mocks.dbQuery.mockResolvedValue({ rows: [] });
    const res = await request(buildApp()).delete('/api/newsletter/unsubscribe?email=test@example.com');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ message: 'Unsubscribed', email: 'test@example.com' });
  });

  it('returns 400 when email query param is missing', async () => {
    const res = await request(buildApp()).delete('/api/newsletter/unsubscribe');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation error');
  });

  it('returns 400 when email is empty string', async () => {
    const res = await request(buildApp()).delete('/api/newsletter/unsubscribe?email=');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation error');
  });

  it('returns 400 when email lacks @ symbol', async () => {
    const res = await request(buildApp()).delete('/api/newsletter/unsubscribe?email=invalid');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation error');
  });

  it('lowercases and trims email before DB update', async () => {
    mocks.dbQuery.mockResolvedValue({ rows: [] });
    await request(buildApp()).delete('/api/newsletter/unsubscribe?email=  Test@Example.COM  ');
    expect(mocks.dbQuery).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE newsletter_preferences'),
      ['test@example.com'],
    );
  });

  it('executes UPDATE SET subscribed=false query', async () => {
    mocks.dbQuery.mockResolvedValue({ rows: [] });
    await request(buildApp()).delete('/api/newsletter/unsubscribe?email=test@example.com');
    expect(mocks.dbQuery).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE newsletter_preferences SET subscribed = false'),
      ['test@example.com'],
    );
  });

  it('returns 500 when DB query throws', async () => {
    mocks.dbQuery.mockRejectedValue(new Error('DB timeout'));
    const res = await request(buildApp()).delete('/api/newsletter/unsubscribe?email=test@example.com');
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Internal server error');
  });
});
