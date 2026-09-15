/**
 * Tests for signal-ingest-routes.ts — payload validation & publisher behaviour suites.
 *
 * Verifies:
 *  - body schema validation (missing field, invalid side, disallowed strategy, confidence >1)
 *  - publisher behaviour (dedup, error propagation)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

// Mock tier gating — route-level tests don't run raas-gate middleware
vi.mock('../../../middleware/feature-gate', () => ({
  requireTier: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  requireFeature: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  canAccessFeature: () => true,
  FEATURE_ACCESS: {},
}));

vi.mock('../../../../shared/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const { mockPublish } = vi.hoisted(() => ({
  mockPublish: vi.fn(),
}));

vi.mock('../../../../desk/signal/signal-publisher', () => ({
  SignalPublisher: vi.fn().mockImplementation(function () {
    this.publish = mockPublish;
  }),
}));

import { createSignalIngestRouter } from '../signal-ingest-routes.js';
import {
  TEST_SECRET,
  MOCK_STORE,
  VALID_BODY,
  buildApp,
  hmacSign,
} from './signal-ingest-routes-fixtures.js';

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
    const res = await request(buildApp(createSignalIngestRouter(MOCK_STORE)))
      .post('/signals/ingest')
      .set(headers)
      .send(body);

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Invalid request body/);
  });

  it('returns 400 on invalid side value', async () => {
    const body = { ...VALID_BODY, side: 'HOLD' };
    const headers = hmacSign(body);
    const res = await request(buildApp(createSignalIngestRouter(MOCK_STORE)))
      .post('/signals/ingest')
      .set(headers)
      .send(body);

    expect(res.status).toBe(400);
  });

  it('returns 400 on disallowed strategy', async () => {
    const body = { ...VALID_BODY, strategy: 'unknown-strategy-v9' };
    const headers = hmacSign(body);
    const res = await request(buildApp(createSignalIngestRouter(MOCK_STORE)))
      .post('/signals/ingest')
      .set(headers)
      .send(body);

    expect(res.status).toBe(400);
  });

  it('returns 400 on confidence out of range (>1)', async () => {
    const body = { ...VALID_BODY, confidence: 1.5 };
    const headers = hmacSign(body);
    const res = await request(buildApp(createSignalIngestRouter(MOCK_STORE)))
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
    const res = await request(buildApp(createSignalIngestRouter(MOCK_STORE)))
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
    const res = await request(buildApp(createSignalIngestRouter(MOCK_STORE)))
      .post('/signals/ingest')
      .set(headers)
      .send(VALID_BODY);

    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/Internal error/);
  });
});
