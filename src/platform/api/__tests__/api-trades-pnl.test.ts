import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { testRequest, getApp, resetApp, TEST_ADMIN_KEY, TEST_REQUEST_ID } from './api-test-helpers';

describe('API Server: Trades & PnL Endpoints', () => {
  beforeAll(async () => {
    process.env.ADMIN_API_KEY = TEST_ADMIN_KEY;
    await getApp();
  }, 30_000);

  afterAll(() => {
    resetApp();
  });

  describe('Trades Endpoints', () => {
    it('GET /api/trades should return empty list', async () => {
      const { status, body } = await testRequest('GET', '/api/trades', {
        headers: { 'x-request-id': TEST_REQUEST_ID },
      });
      expect(status).toBe(200);
      const json = body as Record<string, unknown>;
      expect(json.data).toEqual([]);
      expect(json.total).toBe(0);
    });

    it('GET /api/trades/:id should return 404 for non-existent trade', async () => {
      const { status, body } = await testRequest('GET', '/api/trades/non-existent', {
        headers: { 'x-request-id': TEST_REQUEST_ID },
        params: { id: 'non-existent' },
      });
      expect(status).toBe(404);
      const json = body as Record<string, unknown>;
      expect(json.error).toBe('Trade not found');
    });
  });

  describe('P&L Endpoints', () => {
    it('GET /api/pnl should return performance metrics', async () => {
      const { status, body } = await testRequest('GET', '/api/pnl', {
        headers: { 'x-request-id': TEST_REQUEST_ID },
      });
      expect(status).toBe(200);
      const json = body as Record<string, unknown>;
      expect(json.totalPnl).toBe(100);
      expect(json.winRate).toBe(0.6);
      expect(json.sharpeRatio).toBe(1.5);
    });

    it('GET /api/pnl/daily should return daily summary', async () => {
      const { status, body } = await testRequest('GET', '/api/pnl/daily', {
        headers: { 'x-request-id': TEST_REQUEST_ID },
      });
      expect(status).toBe(200);
      const json = body as Record<string, unknown>;
      expect(json.tradeCount).toBe(10);
      expect(json.winRate).toBe(0.6);
      expect(json.netPnl).toBe(30);
    });
  });
});
