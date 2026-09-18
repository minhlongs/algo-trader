import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

const mocks = vi.hoisted(() => ({ dbQuery: vi.fn() }));
vi.mock('../../../middleware/feature-gate', () => ({ requireTier: () => (_req: unknown, _res: unknown, next: () => void) => next() }));
vi.mock('../../../../shared/utils/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock('../../../../shared/db/postgres-client', () => ({ getDbClient: () => ({ query: mocks.dbQuery }) }));

import { newsletterRouter } from '../newsletter-routes';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/newsletter', newsletterRouter);
  return app;
}

describe('Newsletter Routes: POST /subscribe', () => {
  const VALID_BODY = {
    email: 'test@example.com',
    tenantId: 'tenant_001',
    frequency: 'weekly',
    interests: ['signals', 'market-analysis'],
    topics: 'all',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 200 and subscription confirmation for valid request', async () => {
    mocks.dbQuery.mockResolvedValue({ rows: [] });
    const res = await request(buildApp()).post('/api/newsletter/subscribe').send(VALID_BODY);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ message: 'Subscription updated', email: 'test@example.com', frequency: 'weekly', topics: 'all' });
  });

  it('returns 400 when email is missing', async () => {
    const res = await request(buildApp()).post('/api/newsletter/subscribe').send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation error');
    expect(res.body.message).toContain('email');
  });

  it('returns 400 when email is not a string', async () => {
    const res = await request(buildApp()).post('/api/newsletter/subscribe').send({ email: 12345 });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation error');
  });

  it('returns 400 when email lacks @ symbol', async () => {
    const res = await request(buildApp()).post('/api/newsletter/subscribe').send({ email: 'notanemail' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation error');
  });

  it('defaults to weekly frequency when frequency is invalid', async () => {
    mocks.dbQuery.mockResolvedValue({ rows: [] });
    const res = await request(buildApp()).post('/api/newsletter/subscribe').send({ email: 'test@example.com', frequency: 'yearly' });
    expect(res.status).toBe(200);
    expect(res.body.frequency).toBe('weekly');
  });

  it('defaults to all topics when topics is invalid', async () => {
    mocks.dbQuery.mockResolvedValue({ rows: [] });
    const res = await request(buildApp()).post('/api/newsletter/subscribe').send({ email: 'test@example.com', topics: 'invalid-topic' });
    expect(res.status).toBe(200);
    expect(res.body.topics).toBe('all');
  });

  it('uses provided frequency when valid', async () => {
    mocks.dbQuery.mockResolvedValue({ rows: [] });
    const res = await request(buildApp()).post('/api/newsletter/subscribe').send({ email: 'test@example.com', frequency: 'daily' });
    expect(res.status).toBe(200);
    expect(res.body.frequency).toBe('daily');
  });

  it('trims interests array to max 20 items', async () => {
    mocks.dbQuery.mockResolvedValue({ rows: [] });
    const manyInterests = Array.from({ length: 30 }, (_, i) => `interest-${i}`);
    const res = await request(buildApp()).post('/api/newsletter/subscribe').send({ email: 'test@example.com', interests: manyInterests });
    expect(res.status).toBe(200);
    const insertCall = mocks.dbQuery.mock.calls.find((call: [string, unknown[]]) => call[0]?.includes?.('INSERT INTO newsletter_preferences'));
    expect(insertCall).toBeDefined();
    expect(insertCall![1][3]).toHaveLength(20);
  });

  it('lowercases and trims email before DB insert', async () => {
    mocks.dbQuery.mockResolvedValue({ rows: [] });
    await request(buildApp()).post('/api/newsletter/subscribe').send({ email: '  Test@Example.COM  ' });
    const insertCall = mocks.dbQuery.mock.calls.find((call: [string, unknown[]]) => call[0]?.includes?.('INSERT INTO newsletter_preferences'));
    expect(insertCall).toBeDefined();
    expect(insertCall![1][0]).toBe('test@example.com');
  });

  it('executes INSERT ... ON CONFLICT DO UPDATE query', async () => {
    mocks.dbQuery.mockResolvedValue({ rows: [] });
    await request(buildApp()).post('/api/newsletter/subscribe').send(VALID_BODY);
    expect(mocks.dbQuery).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO newsletter_preferences'),
      expect.arrayContaining(['test@example.com', 'tenant_001', 'weekly', ['signals', 'market-analysis'], 'all']),
    );
  });

  it('returns 500 when DB query throws', async () => {
    mocks.dbQuery.mockRejectedValue(new Error('DB connection lost'));
    const res = await request(buildApp()).post('/api/newsletter/subscribe').send(VALID_BODY);
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Internal server error');
  });

  it('handles empty interests array', async () => {
    mocks.dbQuery.mockResolvedValue({ rows: [] });
    const res = await request(buildApp()).post('/api/newsletter/subscribe').send({ email: 'test@example.com', interests: [] });
    expect(res.status).toBe(200);
    const insertCall = mocks.dbQuery.mock.calls.find((call: [string, unknown[]]) => call[0]?.includes?.('INSERT INTO newsletter_preferences'));
    expect(insertCall![1][3]).toEqual([]);
  });

  it('handles non-array interests as empty array', async () => {
    mocks.dbQuery.mockResolvedValue({ rows: [] });
    const res = await request(buildApp()).post('/api/newsletter/subscribe').send({ email: 'test@example.com', interests: 'not-an-array' });
    expect(res.status).toBe(200);
    const insertCall = mocks.dbQuery.mock.calls.find((call: [string, unknown[]]) => call[0]?.includes?.('INSERT INTO newsletter_preferences'));
    expect(insertCall![1][3]).toEqual([]);
  });

  it('sets tenantId to null when not provided', async () => {
    mocks.dbQuery.mockResolvedValue({ rows: [] });
    await request(buildApp()).post('/api/newsletter/subscribe').send({ email: 'test@example.com' });
    const insertCall = mocks.dbQuery.mock.calls.find((call: [string, unknown[]]) => call[0]?.includes?.('INSERT INTO newsletter_preferences'));
    expect(insertCall![1][1]).toBeNull();
  });

  it('accepts valid frequency "none"', async () => {
    mocks.dbQuery.mockResolvedValue({ rows: [] });
    const res = await request(buildApp()).post('/api/newsletter/subscribe').send({ email: 'test@example.com', frequency: 'none' });
    expect(res.status).toBe(200);
    expect(res.body.frequency).toBe('none');
  });

  it('accepts valid topic "signals"', async () => {
    mocks.dbQuery.mockResolvedValue({ rows: [] });
    const res = await request(buildApp()).post('/api/newsletter/subscribe').send({ email: 'test@example.com', topics: 'signals' });
    expect(res.status).toBe(200);
    expect(res.body.topics).toBe('signals');
  });
});
