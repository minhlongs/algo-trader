import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import {
  mockRedis, mockEmitRateLimit, buildApp, VALID_BODY, resetSecurityMocks,
} from './security-integration-helpers';

describe('Security Integration: Audit & Rate Limiting', () => {
  beforeEach(() => {
    resetSecurityMocks();
  });

  describe('Audit logging captures rate limit events', () => {
    it('should emit audit event when rate limit is exceeded', async () => {
      mockRedis.zcard.mockResolvedValueOnce(100);
      const app = buildApp({ sub: 'tenant-free', role: 'subscriber' });
      const res = await request(app).get('/api/v1/subscriber/credentials').set('x-request-id', 'req-1');

      expect(res.status).toBe(429);
      expect(res.body.error).toBe('RATE_LIMIT_EXCEEDED');
      expect(mockEmitRateLimit).toHaveBeenCalled();
      const [auditParams] = mockEmitRateLimit.mock.calls[0];
      expect(auditParams.tenantId).toBe('tenant-free');
    });

    it('should include rate limit metadata in audit event', async () => {
      mockRedis.zcard.mockResolvedValueOnce(50);
      const app = buildApp({ sub: 'tenant-pro', role: 'subscriber', tier: 'PRO' });
      await request(app).post('/api/v1/subscriber/credentials').send(VALID_BODY).set('x-request-id', 'req-2');
      expect(mockEmitRateLimit).not.toHaveBeenCalled();
    });

    it('should capture tenant isolation in rate limit audit', async () => {
      mockRedis.zcard.mockResolvedValueOnce(100);
      const app = buildApp({ sub: 'tenant-a', role: 'subscriber' });
      await request(app).get('/api/v1/subscriber/credentials').set('x-request-id', 'req-3');

      expect(mockEmitRateLimit).toHaveBeenCalled();
      const [params] = mockEmitRateLimit.mock.calls[0];
      expect(params.tenantId).toBe('tenant-a');
      expect(params.endpoint).toBe('/api/v1/subscriber/credentials');
    });
  });

  describe('Rate limiter enforces tier limits per tenant', () => {
    it('should allow requests within FREE tier limits', async () => {
      mockRedis.zcard.mockResolvedValueOnce(5);
      const app = buildApp({ sub: 'tenant-free', role: 'subscriber', tier: 'FREE' });
      const res = await request(app).post('/api/v1/subscriber/credentials').send(VALID_BODY).set('x-request-id', 'req-4');
      expect(res.status).toBe(201);
      expect(res.body.status).toBe('success');
    });

    it('should allow higher limits for PRO tier', async () => {
      mockRedis.zcard.mockResolvedValueOnce(50);
      const app = buildApp({ sub: 'tenant-pro', role: 'subscriber', tier: 'PRO' });
      const res = await request(app).post('/api/v1/subscriber/credentials').send(VALID_BODY).set('x-request-id', 'req-5');
      expect(res.status).toBe(201);
    });

    it('should allow highest limits for ENTERPRISE tier', async () => {
      mockRedis.zcard.mockResolvedValueOnce(500);
      const app = buildApp({ sub: 'tenant-enterprise', role: 'subscriber', tier: 'ENTERPRISE' });
      const res = await request(app).post('/api/v1/subscriber/credentials').send(VALID_BODY).set('x-request-id', 'req-6');
      expect(res.status).toBe(201);
    });

    it('should allow unlimited for MASTER tier', async () => {
      mockRedis.zcard.mockResolvedValueOnce(5000);
      const app = buildApp({ sub: 'tenant-master', role: 'subscriber', tier: 'MASTER' });
      const res = await request(app).post('/api/v1/subscriber/credentials').send(VALID_BODY).set('x-request-id', 'req-7');
      expect(res.status).toBe(201);
    });

    it('should fail-open when Redis is unavailable', async () => {
      mockRedis.zcard.mockReset();
      mockRedis.zcard.mockRejectedValueOnce(new Error('Redis connection failed'));
      mockRedis.pipeline.mockImplementationOnce(() => ({
        zremrangebyscore: vi.fn().mockReturnThis(),
        zadd: vi.fn().mockReturnThis(),
        expire: vi.fn().mockReturnThis(),
        exec: vi.fn().mockResolvedValue([]),
      }));

      const app = buildApp({ sub: 'tenant-strict', role: 'subscriber', tier: 'FREE' });
      const res = await request(app).post('/api/v1/subscriber/credentials').send(VALID_BODY).set('x-request-id', 'req-8');
      expect(res.status).toBe(201);
    });
  });
});
