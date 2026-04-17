/**
 * Qwen E2E Integration Tests — Phase 05
 *
 * Chains: HMAC POST → signal-ingest-route → SignalPublisher → (mock) SignalStore
 * → paper-trading-orchestrator gates → L1/L2/L3/L4 rollback layers.
 *
 * Uses in-memory mocks for DB + Telegram. No real M1 Max / D1 calls.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createHmac } from 'crypto';

// ─── Module mocks (must be top-level for hoisting) ────────────────────────────

vi.mock('../../src/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const mockQuery = vi.fn();
vi.mock('../../src/db/postgres-client.js', () => ({
  query: (...args: unknown[]) => mockQuery(...args),
}));

vi.mock('../../src/signal/telegram-signal-pusher.js', () => ({
  telegramSignalPusher: {
    sendAdminAlert: vi.fn().mockResolvedValue(true),
    pushSignal: vi.fn().mockResolvedValue(undefined),
  },
}));

// Mock Prometheus to avoid duplicate metric registration between test runs
vi.mock('../../src/middleware/prometheus-metrics.js', () => ({
  qwenSignalsTotal: { inc: vi.fn() },
  qwenPaperPnlPct: { set: vi.fn() },
  qwenSignalsLoopRunsTotal: { inc: vi.fn() },
  qwenSignalsLoopLastRunTs: { set: vi.fn() },
  qwenSignalsLoopJournalWriteErrorsTotal: { inc: vi.fn() },
  qwenStrategyReviewsQueuedTotal: { inc: vi.fn() },
  qwenStrategyReviewsResolvedTotal: { inc: vi.fn() },
  setQwenKillSwitch: vi.fn(),
  setQwenPaperGateDaysRemaining: vi.fn(),
  setQwenDrawdownAutoDisabled: vi.fn(),
  qwenDrawdownMonitorLastRunTs: { set: vi.fn() },
  metricsMiddleware: vi.fn((_req: unknown, _res: unknown, next: () => void) => next()),
}));

// Top-level publish mock — used across all suites
const mockPublish = vi.fn();
vi.mock('../../src/signal/signal-publisher.js', () => ({
  SignalPublisher: vi.fn().mockImplementation(function () {
    this.publish = mockPublish;
  }),
}));

// ─── Imports after mocks ──────────────────────────────────────────────────────

import { createSignalIngestRouter } from '../../src/api/routes/signal-ingest-routes.js';
import {
  resetDrawdownMonitorState,
  disableQwen,
  enableQwen,
  isQwenEnabled,
  runDrawdownCheck,
} from '../../src/wiring/qwen-drawdown-monitor.js';
import { PaperGateError } from '../../src/wiring/qwen-live-eligibility-gate.js';
import { telegramSignalPusher } from '../../src/signal/telegram-signal-pusher.js';
import type { SignalStore } from '../../src/signal/signal-publisher.js';

// ─── Constants ────────────────────────────────────────────────────────────────

const TEST_SECRET = 'test-hmac-secret-e2e-phase05-xxxx';

const VALID_SIGNAL_BODY = {
  market: 'BTC-USD',
  side: 'BUY' as const,
  size: 0.5,
  confidence: 0.85,
  strategy: 'qwen-m1max-v1',
  ttlSec: 300,
};

const ACCEPTED_SIGNAL = {
  id: 'sig-e2e-001',
  ts: Date.now(),
  market: 'BTC-USD',
  side: 'BUY',
  size: 0.5,
  confidence: 0.85,
  strategy: 'qwen-m1max-v1',
  ttl: 300,
  expiresAt: Date.now() + 300_000,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function signRequest(body: object, secret = TEST_SECRET, tsSeconds?: number) {
  const ts = tsSeconds ?? Math.floor(Date.now() / 1000);
  const raw = JSON.stringify(body);
  const hex = createHmac('sha256', secret).update(raw, 'utf8').digest('hex');
  return { 'x-signature-256': `sha256=${hex}`, 'x-timestamp': String(ts) };
}

function makeStore(): SignalStore & { signals: unknown[] } {
  const signals: unknown[] = [];
  return {
    signals,
    saveSignal: vi.fn().mockImplementation(async (s) => { signals.push(s); }),
    getSubscriptions: vi.fn().mockResolvedValue([]),
  };
}

function buildApp(store: SignalStore, secret = TEST_SECRET) {
  process.env.QWEN_INGEST_HMAC_SECRET = secret;
  const app = express();
  app.use(express.json());
  app.use('/api/v1/signals', createSignalIngestRouter(store));
  return app;
}

// ─── Suite 1: Happy path ──────────────────────────────────────────────────────

describe('Qwen E2E — happy path signal ingest', () => {
  let store: ReturnType<typeof makeStore>;
  let app: express.Application;

  beforeEach(() => {
    store = makeStore();
    app = buildApp(store);
    mockPublish.mockResolvedValue(ACCEPTED_SIGNAL);
  });

  afterEach(() => {
    mockPublish.mockReset();
  });

  it('T1: valid HMAC signal → 202 accepted with id', async () => {
    const headers = signRequest(VALID_SIGNAL_BODY);
    const res = await request(app)
      .post('/api/v1/signals/ingest')
      .set(headers)
      .send(VALID_SIGNAL_BODY);

    expect(res.status).toBe(202);
    expect(res.body.status).toBe('accepted');
    expect(typeof res.body.id).toBe('string');
  });

  it('T2: publisher called with correct signal shape', async () => {
    const headers = signRequest(VALID_SIGNAL_BODY);
    await request(app)
      .post('/api/v1/signals/ingest')
      .set(headers)
      .send(VALID_SIGNAL_BODY);

    expect(mockPublish).toHaveBeenCalledOnce();
    const published = mockPublish.mock.calls[0][0];
    expect(published.market).toBe('BTC-USD');
    expect(published.side).toBe('BUY');
    expect(published.strategy).toBe('qwen-m1max-v1');
    expect(published.confidence).toBe(0.85);
  });

  it('T3: publisher returns null → 202 deduplicated status', async () => {
    mockPublish.mockResolvedValueOnce(null); // simulate dedup
    const headers = signRequest(VALID_SIGNAL_BODY);
    const res = await request(app)
      .post('/api/v1/signals/ingest')
      .set(headers)
      .send(VALID_SIGNAL_BODY);

    expect(res.status).toBe(202);
    expect(res.body.status).toBe('deduplicated');
    expect(res.body.id).toBeNull();
  });

  it('T4: deepseek-m1max-v1 strategy is accepted (not Qwen-only)', async () => {
    const deepseekBody = { ...VALID_SIGNAL_BODY, strategy: 'deepseek-m1max-v1' };
    const headers = signRequest(deepseekBody);
    const res = await request(app)
      .post('/api/v1/signals/ingest')
      .set(headers)
      .send(deepseekBody);

    expect([200, 202]).toContain(res.status);
  });
});

// ─── Suite 2: HMAC rejection ──────────────────────────────────────────────────

describe('Qwen E2E — HMAC and validation rejection', () => {
  let store: ReturnType<typeof makeStore>;
  let app: express.Application;

  beforeEach(() => {
    store = makeStore();
    app = buildApp(store);
    mockPublish.mockResolvedValue(ACCEPTED_SIGNAL);
  });

  afterEach(() => {
    mockPublish.mockReset();
  });

  it('T5: wrong secret → 401, publisher NOT called', async () => {
    const headers = signRequest(VALID_SIGNAL_BODY, 'wrong-secret-xxxxxxxxxxxxxxx');
    const res = await request(app)
      .post('/api/v1/signals/ingest')
      .set(headers)
      .send(VALID_SIGNAL_BODY);

    expect(res.status).toBe(401);
    expect(mockPublish).not.toHaveBeenCalled();
  });

  it('T6: stale timestamp (>5 min) → 401, replay protection', async () => {
    const staleTs = Math.floor(Date.now() / 1000) - 400;
    const headers = signRequest(VALID_SIGNAL_BODY, TEST_SECRET, staleTs);
    const res = await request(app)
      .post('/api/v1/signals/ingest')
      .set(headers)
      .send(VALID_SIGNAL_BODY);

    expect(res.status).toBe(401);
    expect(mockPublish).not.toHaveBeenCalled();
  });

  it('T7: missing HMAC headers → 401', async () => {
    const res = await request(app)
      .post('/api/v1/signals/ingest')
      .send(VALID_SIGNAL_BODY);

    expect(res.status).toBe(401);
  });

  it('T8: invalid body schema (bad side value) → 400', async () => {
    const badBody = { ...VALID_SIGNAL_BODY, side: 'LONG' };
    const headers = signRequest(badBody);
    const res = await request(app)
      .post('/api/v1/signals/ingest')
      .set(headers)
      .send(badBody);

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Invalid request body/i);
  });
});

// ─── Suite 3: L1/L2/L3 rollback gates ────────────────────────────────────────

describe('Qwen E2E — rollback gates L1/L2/L3', () => {
  beforeEach(() => {
    resetDrawdownMonitorState();
    mockQuery.mockReset();
    vi.mocked(telegramSignalPusher.sendAdminAlert).mockClear();
  });

  afterEach(() => {
    resetDrawdownMonitorState();
    delete process.env.QWEN_KILL;
    delete process.env.QWEN_DRAWDOWN_MAX_PCT;
  });

  it('T9: L1 kill switch QWEN_KILL=1 blocks isQwenEnabled()', () => {
    process.env.QWEN_KILL = '1';
    expect(isQwenEnabled()).toBe(false);
  });

  it('T10: L2 disableQwen() → false; enableQwen() → true', () => {
    expect(isQwenEnabled()).toBe(true);
    disableQwen('test reason');
    expect(isQwenEnabled()).toBe(false);
    enableQwen();
    expect(isQwenEnabled()).toBe(true);
  });

  it('T11: L3 drawdown breach (6% > 5% threshold) auto-disables + alerts', async () => {
    mockQuery.mockResolvedValue({
      rows: [{ total_size: 1000, total_pnl: -60 }], // -6%
    });
    process.env.QWEN_DRAWDOWN_MAX_PCT = '5';

    await runDrawdownCheck();

    expect(isQwenEnabled()).toBe(false);
    expect(telegramSignalPusher.sendAdminAlert).toHaveBeenCalledOnce();
    const msg = vi.mocked(telegramSignalPusher.sendAdminAlert).mock.calls[0][0];
    expect(msg).toContain('drawdown');
  });
});

// ─── Suite 4: L4 paper gate ───────────────────────────────────────────────────

describe('Qwen E2E — L4 paper gate', () => {
  it('T12: PaperGateError carries 403 status code', () => {
    const err = new PaperGateError('Qwen not yet live-eligible: 0 paper days');
    expect(err).toBeInstanceOf(Error);
    expect(err.statusCode).toBe(403);
    expect(err.name).toBe('PaperGateError');
    expect(err.message).toContain('paper days');
  });
});
