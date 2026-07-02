/**
 * Admin DNA Routes — Integration Tests
 *
 * Tests: GET /status, POST /start, POST /stop, POST /reset, POST /config
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

const mocks = vi.hoisted(() => ({
  mockEngine: {
    isRunning: false,
    paperMode: true,
    getLastConsensus: () => null,
    setPaperMode: () => {},
  },
}));

vi.mock('../../../../desk/strategies/dna/orchestrator', () => ({
  startDnaEngine: vi.fn(() => mocks.mockEngine),
  stopDnaEngine: vi.fn(),
  getDnaEngine: vi.fn(() => mocks.mockEngine),
  resetDnaEngine: vi.fn(),
}));

vi.mock('../../../../desk/strategies/dna/dna-state-store', () => ({
  InMemoryStateStore: vi.fn(),
}));

vi.mock('../../middleware/require-admin-key', () => ({
  requireAdminKey: vi.fn(() => true),
}));

vi.mock('../../../../shared/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { createAdminDnaRouter, setDnaProvider } from '../admin-dna-routes';

function buildApp() {
  const app = express();
  app.use(express.json());
  setDnaProvider({ getCandles: vi.fn() } as any);
  app.use('/api/v1/admin/dna', createAdminDnaRouter());
  return app;
}

describe('Admin DNA Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /status', () => {
    it('returns 200 with engine state', async () => {
      const app = buildApp();
      const res = await request(app).get('/api/v1/admin/dna/status');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('running');
      expect(res.body).toHaveProperty('paperMode');
      expect(res.body).toHaveProperty('timestamp');
    });
  });

  describe('POST /start', () => {
    it('returns 200 with started status', async () => {
      const app = buildApp();
      const res = await request(app)
        .post('/api/v1/admin/dna/start')
        .send({ paperMode: true });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('started');
    });
  });

  describe('POST /stop', () => {
    it('returns 200 with stopped status', async () => {
      const app = buildApp();
      const res = await request(app).post('/api/v1/admin/dna/stop');

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('stopped');
    });
  });

  describe('POST /reset', () => {
    it('returns 200 with reset status', async () => {
      const app = buildApp();
      const res = await request(app).post('/api/v1/admin/dna/reset');

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('reset');
    });
  });

  describe('POST /config', () => {
    it('returns 200 with updated config', async () => {
      const app = buildApp();
      const res = await request(app)
        .post('/api/v1/admin/dna/config')
        .send({ paperMode: true });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('updated');
    });
  });
});
