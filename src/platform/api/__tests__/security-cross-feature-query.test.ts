import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import {
  mockRedis, mockQuery, mockEmitUpsert, mockEmitRateLimit, mockLogAudit,
  buildApp, VALID_BODY, resetSecurityMocks,
} from './security-integration-helpers';

describe('Security Integration: Cross-Feature & Audit Query', () => {
  beforeEach(() => {
    resetSecurityMocks();
  });

  describe('Cross-feature integration', () => {
    it('should audit credential access with rate limit context', async () => {
      mockRedis.zcard.mockResolvedValueOnce(10);
      const app = buildApp({ sub: 'tenant-cross', role: 'subscriber' });
      await request(app).post('/api/v1/subscriber/credentials').send(VALID_BODY).set('x-request-id', 'req-12');
      expect(mockEmitUpsert).toHaveBeenCalled();

      mockRedis.zcard.mockResolvedValueOnce(95);
      await request(app).get('/api/v1/subscriber/credentials').set('x-request-id', 'req-13');
      expect(mockEmitRateLimit).toHaveBeenCalled();
      const [rateAudit] = mockEmitRateLimit.mock.calls[0];
      expect(rateAudit.tenantId).toBe('tenant-cross');
      expect(rateAudit.remainingMs).toBeGreaterThanOrEqual(0);
    });

    it('should maintain tenant isolation across all security features', async () => {
      mockRedis.zcard.mockResolvedValueOnce(5);
      const appA = buildApp({ sub: 'tenant-isolated-a', role: 'subscriber' });
      await request(appA).post('/api/v1/subscriber/credentials').send(VALID_BODY).set('x-request-id', 'req-14');

      mockRedis.zcard.mockResolvedValueOnce(5);
      const appB = buildApp({ sub: 'tenant-isolated-b', role: 'subscriber' });
      await request(appB).post('/api/v1/subscriber/credentials').send(VALID_BODY).set('x-request-id', 'req-15');

      const upsertCalls = mockEmitUpsert.mock.calls;
      expect(upsertCalls).toHaveLength(2);
      expect(upsertCalls[0][0].tenantId).toBe('tenant-isolated-a');
      expect(upsertCalls[1][0].tenantId).toBe('tenant-isolated-b');
    });

    it('should include rate limit headers in responses', async () => {
      mockRedis.zcard.mockResolvedValueOnce(5);
      mockRedis.zcard.mockResolvedValueOnce(4);
      const app = buildApp({ sub: 'tenant-headers', role: 'subscriber' });
      const res = await request(app).post('/api/v1/subscriber/credentials').send(VALID_BODY).set('x-request-id', 'req-16');

      expect(res.headers).toHaveProperty('x-ratelimit-limit');
      expect(res.headers).toHaveProperty('x-ratelimit-remaining');
      expect(res.headers).toHaveProperty('x-ratelimit-reset');
    });

    it('should handle Redis failure gracefully (fail-open)', async () => {
      mockRedis.zcard.mockRejectedValueOnce(new Error('Redis connection failed'));
      const app = buildApp({ sub: 'tenant-redis-fail', role: 'subscriber' });
      const res = await request(app).post('/api/v1/subscriber/credentials').send(VALID_BODY).set('x-request-id', 'req-17');

      expect(res.status).toBe(201);
      expect(mockEmitUpsert).toHaveBeenCalled();
    });

    it('should audit config changes with tenant context', async () => {
      mockRedis.zcard.mockResolvedValueOnce(1);
      const app = buildApp({ sub: 'tenant-config', role: 'admin' });
      const res = await request(app)
        .post('/api/admin/halt')
        .set('x-admin-key', 'test-admin-key-for-api-tests')
        .send({ reason: 'Security test' })
        .set('x-request-id', 'req-18');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(mockLogAudit).toHaveBeenCalled();
    });
  });

  describe('Audit log query with tenant isolation', () => {
    it('should only return logs for authenticated tenant', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'log-1', tenant_id: 'tenant-query', sequence_number: '1', event_type: 'credentials.upsert',
            action_by: 'user', reason: 'credential_created', metadata: '{}', hash: 'hash1', previous_hash: null, created_at: new Date().toISOString(),
          },
        ],
      });
      const app = buildApp({ sub: 'tenant-query', role: 'subscriber' });
      const res = await request(app).get('/api/v1/audit/logs').set('x-request-id', 'req-19');

      expect(res.status).toBe(200);
      expect(res.body.logs).toHaveLength(1);
      expect(res.body.logs[0].tenant_id).toBe('tenant-query');
    });

    it('should reject cross-tenant audit access', async () => {
      const app = buildApp({ sub: 'tenant-a', role: 'subscriber' });
      const res = await request(app).get('/api/v1/audit/logs?tenantId=tenant-b').set('x-request-id', 'req-20');

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('cross-tenant access denied');
    });

    it('should allow admin to query any tenant logs', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const app = buildApp({ sub: 'admin-user', role: 'admin' });
      const res = await request(app).get('/api/v1/audit/logs?tenantId=any-tenant').set('x-request-id', 'req-21');

      expect(res.status).toBe(200);
    });
  });
});
