/**
 * AuditLogService — Core CRUD & Queries
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

describe('AuditLogService', () => {
  let service: AuditLogService;

  beforeEach(() => {
    service = AuditLogService.getInstance();
    resetMockDb();
  });

  describe('log', () => {
    it('should create audit log entry', async () => {
      const log = await service.log('lic-123', 'created');
      expect(log.id).toMatch(/^[0-9a-f]{8}-/i);
      expect(log.licenseId).toBe('lic-123');
      expect(log.event).toBe('created');
      expect(log.createdAt).toBeDefined();
    });

    it('should include optional metadata', async () => {
      const log = await service.log('lic-123', 'activated', {
        tier: 'PRO',
        ip: '192.168.1.1',
        metadata: { subscriptionId: 'sub-123' },
      });
      expect(log.tier).toBe('PRO');
      expect(log.ip).toBe('192.168.1.1');
      expect(log.metadata?.subscriptionId).toBe('sub-123');
    });
  });

  describe('getLogsByLicense', () => {
    it('should get logs by license id', async () => {
      await service.log('lic-123', 'created');
      await service.log('lic-123', 'activated');
      await service.log('lic-456', 'created');
      const logs = await service.getLogsByLicense('lic-123');
      expect(logs.length).toBe(2);
      expect(logs.every((l) => l.licenseId === 'lic-123')).toBe(true);
    });

    it('should filter by event type', async () => {
      await service.log('lic-123', 'created');
      await service.log('lic-123', 'activated');
      await service.log('lic-123', 'api_call');
      const logs = await service.getLogsByLicense('lic-123', { eventType: 'created' });
      expect(logs.length).toBe(1);
      expect(logs[0].event).toBe('created');
    });

    it('should filter by date range', async () => {
      const now = new Date();
      const startDate = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString();
      const endDate = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000).toISOString();
      await service.log('lic-123', 'created');
      const logs = await service.getLogsByLicense('lic-123', { startDate, endDate });
      expect(logs.length).toBe(1);
    });

    it('should paginate with skip and limit', async () => {
      for (let i = 0; i < 15; i++) await service.log('lic-123', 'api_call');
      const page1 = await service.getLogsByLicense('lic-123', { skip: 0, limit: 10 });
      const page2 = await service.getLogsByLicense('lic-123', { skip: 10, limit: 10 });
      expect(page1.length).toBe(10);
      expect(page2.length).toBe(5);
    });
  });

  describe('getAllLogs', () => {
    it('should get all logs', async () => {
      await service.log('lic-123', 'created');
      await service.log('lic-456', 'activated');
      const logs = await service.getAllLogs();
      expect(logs.length).toBe(2);
    });

    it('should filter by license id', async () => {
      await service.log('lic-123', 'created');
      await service.log('lic-456', 'activated');
      const logs = await service.getAllLogs({ licenseId: 'lic-123' });
      expect(logs.length).toBe(1);
      expect(logs[0].licenseId).toBe('lic-123');
    });

    it('should sort by createdAt descending', async () => {
      const log1 = await service.log('lic-123', 'created');
      await new Promise((resolve) => setTimeout(resolve, 10));
      const log2 = await service.log('lic-456', 'created');
      const logs = await service.getAllLogs();
      expect(logs[0].createdAt).toBe(log2.createdAt);
      expect(logs[1].createdAt).toBe(log1.createdAt);
    });
  });

  describe('getRecentActivity', () => {
    it('should get recent logs sorted by date', async () => {
      for (let i = 0; i < 15; i++) await service.log(`lic-${i}`, 'created');
      const recent = await service.getRecentActivity(10);
      expect(recent.length).toBe(10);
    });
  });
});
