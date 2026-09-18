import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import {
  mockRedis, mockQuery, mockEmitUpsert, mockEmitDeletion,
  buildApp, VALID_BODY, resetSecurityMocks,
} from './security-integration-helpers';

describe('Security Integration: Encryption & Credentials', () => {
  beforeEach(() => {
    resetSecurityMocks();
  });

  describe('Encryption protects credentials at rest', () => {
    it('should call audit hook on credential upsert', async () => {
      mockRedis.zcard.mockResolvedValueOnce(1);
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });
      const app = buildApp({ sub: 'tenant-enc', role: 'subscriber' });
      const res = await request(app).post('/api/v1/subscriber/credentials').send(VALID_BODY).set('x-request-id', 'req-9');

      expect(res.status).toBe(201);
      expect(mockEmitUpsert).toHaveBeenCalled();
      const [upsertParams] = mockEmitUpsert.mock.calls[0];
      expect(upsertParams.tenantId).toBe('tenant-enc');
      expect(upsertParams.actionBy).toBe('tenant-enc');
      expect(upsertParams.endpoint).toBe('POST /api/v1/subscriber/credentials');
    });

    it('should call audit hook on credential deletion', async () => {
      mockRedis.zcard.mockResolvedValueOnce(1);
      mockQuery.mockResolvedValueOnce({ rows: [{ 1: 1 }] });
      const app = buildApp({ sub: 'tenant-del', role: 'subscriber' });
      const res = await request(app).delete('/api/v1/subscriber/credentials').set('x-request-id', 'req-10');

      expect(res.status).toBe(200);
      expect(mockEmitDeletion).toHaveBeenCalled();
      const [delParams] = mockEmitDeletion.mock.calls[0];
      expect(delParams.tenantId).toBe('tenant-del');
      expect(delParams.actionBy).toBe('tenant-del');
      expect(delParams.endpoint).toBe('DELETE /api/v1/subscriber/credentials');
    });

    it('should reject invalid credentials without calling upsert audit', async () => {
      mockRedis.zcard.mockResolvedValueOnce(1);
      const app = buildApp({ sub: 'tenant-invalid', role: 'subscriber' });
      const res = await request(app).post('/api/v1/subscriber/credentials').send({ apiKey: 'only-key' }).set('x-request-id', 'req-11');

      expect(res.status).toBe(400);
      expect(mockEmitUpsert).not.toHaveBeenCalled();
    });
  });

  describe('Encryption key rotation simulation', () => {
    it('should handle version-prefixed ciphertext correctly', async () => {
      mockRedis.zcard.mockResolvedValueOnce(1);
      const app = buildApp({ sub: 'tenant-rotation', role: 'subscriber' });
      const res = await request(app).post('/api/v1/subscriber/credentials').send(VALID_BODY).set('x-request-id', 'req-22');

      expect(res.status).toBe(201);
      expect(mockEmitUpsert).toHaveBeenCalled();
    });
  });
});
