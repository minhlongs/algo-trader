/**
 * Signal Ingest Routes Tests — HMAC Authentication
 * Covers HMAC valid/invalid, secret mismatch, tampered body, expired timestamp, missing headers.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createHmac } from 'crypto';

vi.mock('../../../utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const mockPublish = vi.fn();

vi.mock('../../../signal/signal-publisher.js', () => ({
  SignalPublisher: vi.fn().mockImplementation(function (this: { publish: typeof mockPublish }) {
    this.publish = mockPublish;
  }),
}));

import { TEST_SECRET, VALID_BODY, buildApp, hmacSign } from './signal-ingest-routes-fixtures';

describe('POST /signals/ingest — HMAC authentication', () => {
  beforeEach(() => {
    mockPublish.mockReset();
    mockPublish.mockResolvedValue({
      id: 'sig-test-001',
      ts: Date.now(),
      market: 'BTC-USD',
      side: 'BUY',
      size: 0.5,
      confidence: 0.8,
      strategy: 'qwen-m1max-v1',
      ttl: 300,
      expiresAt: Date.now() + 300_000,
    });
  });

  it('returns 202 with id on valid HMAC', async () => {
    const headers = hmacSign(VALID_BODY);
    const res = await request(buildApp())
      .post('/signals/ingest')
      .set(headers)
      .send(VALID_BODY);

    expect(res.status).toBe(202);
    expect(res.body.status).toBe('accepted');
    expect(res.body.id).toBe('sig-test-001');
  });

  it('returns 401 on wrong HMAC secret', async () => {
    const headers = hmacSign(VALID_BODY, 'wrong-secret-xxxxxxxxxxxxxxxxxx');
    const res = await request(buildApp())
      .post('/signals/ingest')
      .set(headers)
      .send(VALID_BODY);

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/Invalid signature/);
  });

  it('returns 401 on tampered body after signing', async () => {
    const headers = hmacSign(VALID_BODY);
    const tamperedBody = { ...VALID_BODY, confidence: 0.99 };
    const res = await request(buildApp())
      .post('/signals/ingest')
      .set(headers)
      .send(tamperedBody);

    expect(res.status).toBe(401);
  });

  it('returns 401 on expired timestamp (>5 min old)', async () => {
    const staleTs = Math.floor(Date.now() / 1000) - 400;
    const headers = hmacSign(VALID_BODY, TEST_SECRET, staleTs);
    const res = await request(buildApp())
      .post('/signals/ingest')
      .set(headers)
      .send(VALID_BODY);

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/Invalid signature|expired/);
  });

  it('returns 401 when X-Signature-256 header is missing', async () => {
    const ts = Math.floor(Date.now() / 1000);
    const res = await request(buildApp())
      .post('/signals/ingest')
      .set('x-timestamp', String(ts))
      .send(VALID_BODY);

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/Missing authentication headers/);
  });

  it('returns 401 when X-Timestamp header is missing', async () => {
    const raw = JSON.stringify(VALID_BODY);
    const hex = createHmac('sha256', TEST_SECRET).update(raw).digest('hex');
    const res = await request(buildApp())
      .post('/signals/ingest')
      .set('x-signature-256', `sha256=${hex}`)
      .send(VALID_BODY);

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/Missing authentication headers/);
  });
});
