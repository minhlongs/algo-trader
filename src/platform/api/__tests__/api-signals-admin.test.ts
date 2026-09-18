import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { testRequest, getApp, resetApp, TEST_ADMIN_KEY, TEST_REQUEST_ID } from './api-test-helpers';

describe('API Server: Signals & Admin Endpoints', () => {
  beforeAll(async () => {
    process.env.ADMIN_API_KEY = TEST_ADMIN_KEY;
    await getApp();
  }, 30_000);

  afterAll(() => {
    resetApp();
  });

  describe('Signals Endpoints', () => {
    it('GET /api/signals should return empty signals', async () => {
      const { status, body } = await testRequest('GET', '/api/signals', {
        headers: { 'x-request-id': TEST_REQUEST_ID },
      });
      expect(status).toBe(200);
      const json = body as Record<string, unknown>;
      expect(json.data).toEqual([]);
      expect(json.count).toBe(0);
    });

    it('GET /api/signals?minSpread=0.5 should filter by spread', async () => {
      const { status, body } = await testRequest('GET', '/api/signals?minSpread=0.5', {
        headers: { 'x-request-id': TEST_REQUEST_ID },
        query: { minSpread: '0.5' },
      });
      expect(status).toBe(200);
      const json = body as Record<string, unknown>;
      expect(json.data).toEqual([]);
    });
  });

  describe('Admin Endpoints', () => {
    it('POST /api/admin/halt should halt trading', async () => {
      const { status, body } = await testRequest('POST', '/api/admin/halt', {
        headers: {
          'x-request-id': TEST_REQUEST_ID,
          'x-admin-key': TEST_ADMIN_KEY,
        },
        body: { reason: 'Testing' },
      });
      expect(status).toBe(200);
      const json = body as Record<string, unknown>;
      expect(json.success).toBe(true);
    });

    it('POST /api/admin/halt should reject without reason', async () => {
      const { status, body } = await testRequest('POST', '/api/admin/halt', {
        headers: {
          'x-request-id': TEST_REQUEST_ID,
          'x-admin-key': TEST_ADMIN_KEY,
        },
        body: { reason: '' },
      });
      expect(status).toBe(400);
      const json = body as Record<string, unknown>;
      expect(json.error).toBe('Reason is required');
    });

    it('POST /api/admin/resume should resume trading', async () => {
      const { status, body } = await testRequest('POST', '/api/admin/resume', {
        headers: {
          'x-request-id': TEST_REQUEST_ID,
          'x-admin-key': TEST_ADMIN_KEY,
        },
      });
      expect(status).toBe(200);
      const json = body as Record<string, unknown>;
      expect(json.success).toBe(true);
    });

    it('GET /api/admin/status should return system status', async () => {
      const { status, body } = await testRequest('GET', '/api/admin/status', {
        headers: {
          'x-request-id': TEST_REQUEST_ID,
          'x-admin-key': TEST_ADMIN_KEY,
        },
      });
      expect(status).toBe(200);
      const json = body as Record<string, unknown>;
      expect(json.trading).toBeDefined();
      expect(json.circuitBreaker).toBeDefined();
      expect(json.drawdown).toBeDefined();
    });
  });
});
