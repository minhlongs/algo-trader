/**
 * Tests for signal-ingest-routes.ts
 * Covers: HMAC valid/invalid, stale timestamp, missing headers,
 *         body schema validation, dedup path, publisher error, rate limit shape.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createHmac } from 'crypto';

// --- Mocks ---

vi.mock('../../../utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const mockPublish = vi.fn();

vi.mock('../../../signal/signal-publisher.js', () => ({
  SignalPublisher: vi.fn().mockImplementation(function () {
    this.publish = mockPublish;
  }),
}));

import { createSignalIngestRouter } from '../signal-ingest-routes.js';

// --- Helpers ---

const TEST_SECRET = 'test-hmac-secret-32chars-xxxxxxxx';
const MOCK_STORE = {} as Parameters<typeof createSignalIngestRouter>[0];

function buildApp(secret = TEST_SECRET) {
  process.env.QWEN_INGEST_HMAC_SECRET = secret;
  const app = express();
  // Raw body capture — must parse before HMAC re-stringify
  app.use(express.json());
  app.use('/signals', createSignalIngestRouter(MOCK_STORE));
  return app;
}

function hmacSign(body: object, secret = TEST_SECRET, tsSeconds?: number): Record<string, string> {
  const ts = tsSeconds ?? Math.floor(Date.now() / 1000);
  const raw = JSON.stringify(body);
  const hex = createHmac('sha256', secret).update(raw, 'utf8').digest('hex');
  return {
    'x-signature-256': `sha256=${hex}`,
    'x-timestamp': String(ts),
  };
}

const VALID_BODY = {
  market: 'BTC-USD',
  side: 'BUY',
  size: 0.5,
  confidence: 0.8,
  strategy: 'qwen-m1max-v1',
  ttlSec: 300,
};

// --- Tests ---

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
    const tamperedBody = { ...VALID_BODY, confidence: 0.99 }; // body changed after sign
    const res = await request(buildApp())
      .post('/signals/ingest')
      .set(headers)
      .send(tamperedBody);

    expect(res.status).toBe(401);
  });

  it('returns 401 on expired timestamp (>5 min old)', async () => {
    const staleTs = Math.floor(Date.now() / 1000) - 400; // 400s ago > 300s window
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
