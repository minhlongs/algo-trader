/**
 * Signal Ingest Routes Tests — Payload Validation & Publisher Behaviour
 * Covers body schema validation, dedup path, publisher error, rate limit shape.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

vi.mock('../../../utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const mockPublish = vi.fn();

vi.mock('../../../signal/signal-publisher.js', () => ({
  SignalPublisher: vi.fn().mockImplementation(function (this: { publish: typeof mockPublish }) {
    this.publish = mockPublish;
  }),
}));

import { VALID_BODY, buildApp, hmacSign } from './signal-ingest-routes-fixtures';

describe('POST /signals/ingest — payload validation', () => {
  beforeEach(() => {
    mockPublish.mockReset();
    mockPublish.mockResolvedValue({
      id: 'sig-002',
      ts: Date.now(),
      market: 'ETH-USD',
      side: 'SELL',
      size: 0.3,
      confidence: 0.7,
      strategy: 'qwen-m1max-v1',
      ttl: 120,
      expiresAt: Date.now() + 120_000,
    });
  });

  it('returns 400 on missing required field (market)', async () => {
    const body = { ...VALID_BODY };
    delete (body as Partial<typeof VALID_BODY>).market;
    const headers = hmacSign(body);
    const res = await request(buildApp())
      .post('/signals/ingest')
      .set(headers)
      .send(body);

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Invalid request body/);
  });

  it('returns 400 on invalid side value', async () => {
    const body = { ...VALID_BODY, side: 'HOLD' };
    const headers = hmacSign(body);
    const res = await request(buildApp())
      .post('/signals/ingest')
      .set(headers)
      .send(body);

    expect(res.status).toBe(400);
  });

  it('returns 400 on disallowed strategy', async () => {
    const body = { ...VALID_BODY, strategy: 'unknown-strategy-v9' };
    const headers = hmacSign(body);
    const res = await request(buildApp())
      .post('/signals/ingest')
      .set(headers)
      .send(body);

    expect(res.status).toBe(400);
  });

  it('returns 400 on confidence out of range (>1)', async () => {
    const body = { ...VALID_BODY, confidence: 1.5 };
    const headers = hmacSign(body);
    const res = await request(buildApp())
      .post('/signals/ingest')
      .set(headers)
      .send(body);

    expect(res.status).toBe(400);
  });
});

describe('POST /signals/ingest — publisher behaviour', () => {
  it('returns 202 deduplicated when publisher returns null', async () => {
    mockPublish.mockResolvedValue(null);
    const headers = hmacSign(VALID_BODY);
    const res = await request(buildApp())
      .post('/signals/ingest')
      .set(headers)
      .send(VALID_BODY);

    expect(res.status).toBe(202);
    expect(res.body.status).toBe('deduplicated');
    expect(res.body.id).toBeNull();
  });

  it('returns 500 when publisher throws', async () => {
    mockPublish.mockRejectedValue(new Error('DB down'));
    const headers = hmacSign(VALID_BODY);
    const res = await request(buildApp())
      .post('/signals/ingest')
      .set(headers)
      .send(VALID_BODY);

    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/Internal error/);
  });
});
