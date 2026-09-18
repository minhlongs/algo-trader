import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { testRequest, getApp, resetApp, TEST_ADMIN_KEY, TEST_REQUEST_ID } from './api-test-helpers';

describe('API Server: Health Endpoints & 404', () => {
  beforeAll(async () => {
    process.env.ADMIN_API_KEY = TEST_ADMIN_KEY;
    await getApp();
  }, 30_000);

  afterAll(() => {
    resetApp();
  });

  describe('Health Endpoints', () => {
    it('GET /health should return healthy status', { timeout: 15_000 }, async () => {
      const { status, body } = await testRequest('GET', '/health', {
        headers: { 'x-request-id': TEST_REQUEST_ID },
      });
      expect(status).toBe(200);
      const json = body as Record<string, unknown>;
      expect(json.status).toBe('healthy');
      expect(json.version).toBeDefined();
      expect(typeof json.uptime).toBe('number');
      expect(json.uptime).toBeGreaterThanOrEqual(0);
      expect((json.components as Record<string, string>).redis).toBe('ok');
      expect((json.components as Record<string, string>).tradingEngine).toBe('ok');
      expect(json.memory).toBeDefined();
      expect(json.paperTrading).toBeDefined();
    });

    it('GET /health exposes fable-5 rollback booleans', { timeout: 15_000 }, async () => {
      const { status, body } = await testRequest('GET', '/health', {
        headers: { 'x-request-id': TEST_REQUEST_ID },
      });
      expect(status).toBe(200);
      const json = body as Record<string, unknown>;
      expect(json.qwen).toBeDefined();
      expect(typeof (json.qwen as Record<string, boolean>).enabled).toBe('boolean');
      expect(typeof (json.qwen as Record<string, boolean>).killSwitchActive).toBe('boolean');
    });

    it('GET /health/metrics should return system metrics', { timeout: 15_000 }, async () => {
      const { status, body } = await testRequest('GET', '/health/metrics', {
        headers: { 'x-request-id': TEST_REQUEST_ID },
      });
      expect(status).toBe(200);
      const json = body as Record<string, unknown>;
      expect(json.redis).toBeDefined();
      expect((json.redis as Record<string, unknown>).keys_count).toBeDefined();
      expect(json.process).toBeDefined();
      expect(json.version).toBeDefined();
    });
  });

  describe('404 Handler', () => {
    it('should return 404 for unknown routes', async () => {
      const { status, body } = await testRequest('GET', '/api/unknown', {
        headers: { 'x-request-id': TEST_REQUEST_ID },
      });
      expect(status).toBe(404);
      const json = body as Record<string, unknown>;
      expect(json.error).toBe('Not found');
    });
  });
});
