/**
 * Dunning Service Tests
 * ROIaaS Phase 5 - License suspension/reinstatement workflow tests
 *
 * Note: DunningService now uses DB-backed storage (dunning_state table).
 * These tests mock getDbClient() to avoid requiring a real database.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DunningService } from '../dunning-service';
import { LicenseService } from '../license-service';
import { LicenseTier } from '../../../shared/types/license';

// Mock DB client to avoid real database dependency
const mockQuery = vi.fn();
const mockPool = { query: mockQuery };

const { mockLicenseQuery, licenses } = vi.hoisted(() => {
  const data = new Map<string, Record<string, any>>();
  const fn = vi.fn((text: string, params?: any[]) => {
    if (text.startsWith('INSERT INTO licenses')) {
      const row: Record<string, any> = {
        id: params![0], name: params![1], key: params![2],
        tier: params![3], status: params![4],
        created_at: params![5], updated_at: params![6],
        usage_count: params![7], max_usage: params![8],
        tenant_id: params![9], domain: params![10],
        expires_at: params![11],
        subscription_id: null, user_id: null,
      };
      data.set(row.id, row);
      return { rows: [row] };
    }
    return { rows: [] };
  });
  return { mockLicenseQuery: fn, licenses: data };
});

vi.mock('../../../shared/db/postgres-client', () => ({
  getDbClient: () => mockPool,
  query: mockLicenseQuery,
}));

// Mock logger
vi.mock('../../../shared/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// Mock email service
vi.mock('../../notifications/email-service', () => ({
  EmailService: {
    getInstance: () => ({
      initialize: vi.fn(),
      isInitialized: vi.fn().mockReturnValue(true),
      send: vi.fn().mockResolvedValue(true),
    }),
  },
}));

describe('DunningService', () => {
  let service: DunningService;
  let licenseService: LicenseService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = DunningService.getInstance();
    licenseService = LicenseService.getInstance();
    licenses.clear();

    // Default mock: no existing dunning records
    mockQuery.mockReset();
    mockQuery.mockResolvedValue({ rows: [] });
  });

  describe('recordPaymentFailure', () => {
    it('should create new dunning record on first payment failure', async () => {
      const license = await licenseService.createLicense({
        name: 'Test License',
        tier: LicenseTier.PRO,
      });

      // Mock upsert success
      mockQuery.mockResolvedValue({ rows: [] });

      const record = await service.recordPaymentFailure(
        license.id,
        'test@example.com',
        'sub-123'
      );

      expect(record.id).toMatch(/^dun_/);
      expect(record.licenseId).toBe(license.id);
      expect(record.customerEmail).toBe('test@example.com');
      expect(record.retryCount).toBe(1);
      expect(record.status).toBe('active');
    });
  });

  describe('recordPaymentSuccess', () => {
    it('should return undefined if no dunning record exists', async () => {
      const license = await licenseService.createLicense({
        name: 'Test License',
        tier: LicenseTier.PRO,
      });

      const result = await service.recordPaymentSuccess(license.id, 'test@example.com');

      expect(result).toBeUndefined();
    });
  });

  describe('getSuspensionStatus', () => {
    it('should return active status when no dunning record exists', async () => {
      const license = await licenseService.createLicense({
        name: 'Test License',
        tier: LicenseTier.PRO,
      });

      const status = await service.getSuspensionStatus(license.id);

      expect(status.isSuspended).toBe(false);
      expect(status.status).toBe('active');
      expect(status.retryCount).toBe(0);
    });
  });

  describe('getAllDunningRecords', () => {
    it('should return empty array when no records exist', async () => {
      const records = await service.getAllDunningRecords();
      expect(records).toEqual([]);
    });
  });

  describe('getDunningRecordByLicense', () => {
    it('should return undefined for license without dunning record', async () => {
      const license = await licenseService.createLicense({
        name: 'Test License',
        tier: LicenseTier.PRO,
      });

      const record = await service.getDunningRecordByLicense(license.id);
      expect(record).toBeUndefined();
    });
  });

  describe('checkAndSuspendExpiredGracePeriods', () => {
    it('should return checked count even with no records', async () => {
      const result = await service.checkAndSuspendExpiredGracePeriods();
      expect(result).toHaveProperty('suspended');
      expect(result).toHaveProperty('checked');
      expect(result.suspended).toEqual([]);
    });
  });

  describe('DunningConfig', () => {
    it('should load default config', () => {
      const config = (service as any).config;
      expect(config.enabled).toBe(true);
      expect(config.maxRetries).toBe(3);
      expect(config.gracePeriodDays).toBe(7);
    });
  });
});
