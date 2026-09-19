/**
 * AuditLogService — Specialized Logs, Batch, Retention & Export
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  MOCK_DB,
  resetMockDb,
  mockQueryImpl,
  mockLogAuditImpl,
  mockGetAuditTrailImpl,
  mockGetAuditTrailByTenantImpl,
} from "./audit-log-service.fixtures";

vi.mock("../../../db/postgres-client", () => ({
  query: mockQueryImpl,
  transaction: vi.fn(async (fn: (client: { query: typeof mockQueryImpl }) => unknown) => fn({ query: mockQueryImpl })),
}));
vi.mock("../../../seed/security/audit-log", () => ({
  logAudit: mockLogAuditImpl,
  getAuditTrail: mockGetAuditTrailImpl,
  getAuditTrailByTenant: mockGetAuditTrailByTenantImpl,
}));
vi.mock("../../../seed/security/audit-ip-hash", () => ({
  hashIpAddress: vi.fn(() => "hashed-ip"),
}));

import { AuditLogService } from "../audit-log-service";

describe('AuditLogService - Operations & Exports', () => {
  let service: AuditLogService;

  beforeEach(() => {
    service = AuditLogService.getInstance();
    resetMockDb();
  });

  describe('logApiCall', () => {
    it('should log API call event', async () => {
      const log = await service.logApiCall('lic-123', '/api/v1/trades', {
        ip: '192.168.1.1',
        tier: 'PRO',
      });
      expect(log.event).toBe('api_call');
      expect(log.metadata?.endpoint).toBe('/api/v1/trades');
      expect(log.ip).toBe('192.168.1.1');
    });
  });

  describe('logMlFeature', () => {
    it('should log ML feature usage', async () => {
      const log = await service.logMlFeature('lic-123', 'hyperparameter_tuning', {
        tier: 'ENTERPRISE',
      });
      expect(log.event).toBe('ml_feature');
      expect(log.metadata?.feature).toBe('hyperparameter_tuning');
      expect(log.tier).toBe('ENTERPRISE');
    });
  });

  describe('logRateLimit', () => {
    it('should log rate limit event', async () => {
      const log = await service.logRateLimit('lic-123', 100, 95, {
        tier: 'FREE',
        ip: '192.168.1.1',
      });
      expect(log.event).toBe('rate_limit');
      expect(log.metadata?.limit).toBe(100);
      expect(log.metadata?.current).toBe(95);
    });
  });

  describe('batchWrite', () => {
    it('should write multiple logs in batch', async () => {
      const entries = [
        { licenseId: 'lic-1', event: 'created' as const },
        { licenseId: 'lic-2', event: 'activated' as const },
        { licenseId: 'lic-3', event: 'api_call' as const },
      ];
      const result = await service.batchWrite(entries);
      expect(result.success).toBe(3);
      expect(result.failed).toBe(0);
      expect(result.errors.length).toBe(0);
    });

    it('should respect batch size limit', async () => {
      const entries = Array(150).fill({ licenseId: 'lic-1', event: 'created' as const });
      const result = await service.batchWrite(entries);
      expect(result.success).toBeLessThanOrEqual(100);
      expect(result.failed).toBeGreaterThan(0);
    });
  });

  describe('getExpiredLogIds', () => {
    it('should return empty array when no logs expired', async () => {
      const expiredIds = await service.getExpiredLogIds();
      expect(expiredIds.length).toBe(0);
    });
  });

  describe('cleanupExpiredLogs', () => {
    it('should remove expired logs', async () => {
      await service.log('lic-123', 'created');
      const result = await service.cleanupExpiredLogs();
      expect(result).toHaveProperty('removed');
      expect(result).toHaveProperty('cutoffDate');
    });
  });

  describe('exportToCsv', () => {
    it('should export logs as CSV', async () => {
      const log1 = await service.log('lic-123', 'created', { tier: 'PRO' });
      const log2 = await service.log('lic-456', 'activated', { tier: 'FREE' });
      const csv = service.exportToCsv([log1, log2]);
      expect(csv).toContain('id,licenseId,event,tier,ip,metadata,createdAt');
      expect(csv).toContain('lic-123');
      expect(csv).toContain('lic-456');
    });

    it('should handle empty logs array', () => {
      const csv = service.exportToCsv([]);
      expect(csv).toContain('id,licenseId,event,tier,ip,metadata,createdAt');
    });
  });

  describe('exportToJson', () => {
    it('should export logs as JSON', async () => {
      const log = await service.log('lic-123', 'created', { tier: 'PRO' });
      const json = service.exportToJson([log]);
      const parsed = JSON.parse(json);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed[0].id).toBe(log.id);
      expect(parsed[0].licenseId).toBe('lic-123');
    });
  });

  describe('getRetentionDays', () => {
    it('should return retention days config', () => {
      const retentionDays = service.getRetentionDays();
      expect(retentionDays).toBeGreaterThanOrEqual(1);
    });
  });

  describe('getBatchSize', () => {
    it('should return batch size config', () => {
      const batchSize = service.getBatchSize();
      expect(batchSize).toBeGreaterThanOrEqual(1);
    });
  });
});
