/**
 * Unit tests for DunningWorkflow static methods
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DunningWorkflow } from '../../../../src/platform/billing/dunning/workflow';
import { LicenseStatus } from '../../../../src/shared/types/license';
import type { DunningRecord, DunningConfig } from '../../../../src/platform/billing/dunning-service';

describe('DunningWorkflow', () => {
  const defaultConfig: DunningConfig = {
    maxRetries: 3,
    retryIntervalDays: 3,
    gracePeriodDays: 7,
    autoDowngradeEnabled: true,
  };

  describe('getDaysSince', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-09-25T12:00:00Z'));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('calculates 0 days for current timestamp', () => {
      expect(DunningWorkflow.getDaysSince('2026-09-25T12:00:00Z')).toBe(0);
    });

    it('calculates exact past days correctly', () => {
      expect(DunningWorkflow.getDaysSince('2026-09-20T12:00:00Z')).toBe(5);
      expect(DunningWorkflow.getDaysSince('2026-09-15T12:00:00Z')).toBe(10);
    });
  });

  describe('shouldSuspend', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-09-25T12:00:00Z'));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('returns shouldSuspend=false when neither retry count nor grace period is exceeded', () => {
      const result = DunningWorkflow.shouldSuspend(1, '2026-09-23T12:00:00Z', defaultConfig);
      expect(result.shouldSuspend).toBe(false);
      expect(result.daysSinceFirstFailure).toBe(2);
    });

    it('returns shouldSuspend=true when retryCount reaches or exceeds maxRetries', () => {
      const result = DunningWorkflow.shouldSuspend(3, '2026-09-24T12:00:00Z', defaultConfig);
      expect(result.shouldSuspend).toBe(true);
      expect(result.daysSinceFirstFailure).toBe(1);

      const exceededResult = DunningWorkflow.shouldSuspend(5, '2026-09-24T12:00:00Z', defaultConfig);
      expect(exceededResult.shouldSuspend).toBe(true);
    });

    it('returns shouldSuspend=true when days exceed gracePeriodDays even if retries under limit', () => {
      const result = DunningWorkflow.shouldSuspend(1, '2026-09-17T12:00:00Z', defaultConfig);
      expect(result.shouldSuspend).toBe(true);
      expect(result.daysSinceFirstFailure).toBe(8);
    });
  });

  describe('getDaysUntilSuspension', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-09-25T12:00:00Z'));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('returns remaining grace days when within grace period', () => {
      const days = DunningWorkflow.getDaysUntilSuspension('2026-09-22T12:00:00Z', defaultConfig);
      expect(days).toBe(4); // 7 - 3 = 4
    });

    it('clamps to 0 when grace period has elapsed', () => {
      const days = DunningWorkflow.getDaysUntilSuspension('2026-09-15T12:00:00Z', defaultConfig);
      expect(days).toBe(0);
    });
  });

  describe('suspendLicense', () => {
    it('revokes license, sets suspended status, saves record, and logs audit', async () => {
      const mockLicense = {
        id: 'lic-1',
        status: LicenseStatus.ACTIVE,
        updatedAt: '2026-01-01T00:00:00Z',
      };
      const mockLicenseService = {
        getLicense: vi.fn().mockReturnValue(mockLicense),
      };
      const mockAuditService = {
        log: vi.fn().mockResolvedValue(undefined),
      };
      const mockSaveRecord = vi.fn().mockResolvedValue(undefined);

      const sampleRecord: DunningRecord = {
        id: 'dun-1',
        licenseId: 'lic-1',
        customerEmail: 'user@example.com',
        stripeSubscriptionId: 'sub-1',
        status: 'active',
        retryCount: 3,
        firstFailureDate: '2026-09-18T00:00:00Z',
        lastFailureDate: '2026-09-25T00:00:00Z',
        createdAt: '2026-09-18T00:00:00Z',
        updatedAt: '2026-09-18T00:00:00Z',
      };

      await DunningWorkflow.suspendLicense(
        'lic-1',
        sampleRecord,
        mockLicenseService as any,
        mockAuditService as any,
        mockSaveRecord,
      );

      expect(mockLicense.status).toBe(LicenseStatus.REVOKED);
      expect(sampleRecord.status).toBe('suspended');
      expect(sampleRecord.suspensionDate).toBeDefined();
      expect(mockSaveRecord).toHaveBeenCalledWith(sampleRecord);
      expect(mockAuditService.log).toHaveBeenCalledWith('lic-1', 'revoked', {
        metadata: {
          eventType: 'suspended',
          retryCount: 3,
          reason: 'payment_failed_dunning',
        },
      });
    });

    it('returns early when license is not found', async () => {
      const mockLicenseService = {
        getLicense: vi.fn().mockReturnValue(undefined),
      };
      const mockAuditService = { log: vi.fn() };
      const mockSaveRecord = vi.fn();

      const sampleRecord: DunningRecord = {
        id: 'dun-2',
        licenseId: 'lic-missing',
        customerEmail: 'user@example.com',
        stripeSubscriptionId: 'sub-2',
        status: 'active',
        retryCount: 3,
        firstFailureDate: '2026-09-18T00:00:00Z',
        lastFailureDate: '2026-09-25T00:00:00Z',
        createdAt: '2026-09-18T00:00:00Z',
        updatedAt: '2026-09-18T00:00:00Z',
      };

      await DunningWorkflow.suspendLicense(
        'lic-missing',
        sampleRecord,
        mockLicenseService as any,
        mockAuditService as any,
        mockSaveRecord,
      );

      expect(mockSaveRecord).not.toHaveBeenCalled();
      expect(mockAuditService.log).not.toHaveBeenCalled();
    });
  });

  describe('reinstateLicense', () => {
    it('activates license, sets reinstated status, saves record, and logs audit', async () => {
      const mockLicense = {
        id: 'lic-1',
        status: LicenseStatus.REVOKED,
        updatedAt: '2026-01-01T00:00:00Z',
      };
      const mockLicenseService = {
        getLicense: vi.fn().mockReturnValue(mockLicense),
      };
      const mockAuditService = {
        log: vi.fn().mockResolvedValue(undefined),
      };
      const mockSaveRecord = vi.fn().mockResolvedValue(undefined);

      const sampleRecord: DunningRecord = {
        id: 'dun-1',
        licenseId: 'lic-1',
        customerEmail: 'user@example.com',
        stripeSubscriptionId: 'sub-1',
        status: 'suspended',
        retryCount: 3,
        firstFailureDate: '2026-09-18T00:00:00Z',
        lastFailureDate: '2026-09-25T00:00:00Z',
        createdAt: '2026-09-18T00:00:00Z',
        updatedAt: '2026-09-18T00:00:00Z',
      };

      await DunningWorkflow.reinstateLicense(
        'lic-1',
        sampleRecord,
        mockLicenseService as any,
        mockAuditService as any,
        mockSaveRecord,
      );

      expect(mockLicense.status).toBe(LicenseStatus.ACTIVE);
      expect(sampleRecord.status).toBe('reinstated');
      expect(sampleRecord.reinstatementDate).toBeDefined();
      expect(mockSaveRecord).toHaveBeenCalledWith(sampleRecord);
      expect(mockAuditService.log).toHaveBeenCalledWith('lic-1', 'activated', {
        metadata: {
          eventType: 'reinstated',
          reason: 'payment_success',
        },
      });
    });

    it('returns early when license is not found on reinstate', async () => {
      const mockLicenseService = {
        getLicense: vi.fn().mockReturnValue(undefined),
      };
      const mockAuditService = { log: vi.fn() };
      const mockSaveRecord = vi.fn();

      const sampleRecord: DunningRecord = {
        id: 'dun-3',
        licenseId: 'lic-missing',
        customerEmail: 'user@example.com',
        stripeSubscriptionId: 'sub-3',
        status: 'suspended',
        retryCount: 3,
        firstFailureDate: '2026-09-18T00:00:00Z',
        lastFailureDate: '2026-09-25T00:00:00Z',
        createdAt: '2026-09-18T00:00:00Z',
        updatedAt: '2026-09-18T00:00:00Z',
      };

      await DunningWorkflow.reinstateLicense(
        'lic-missing',
        sampleRecord,
        mockLicenseService as any,
        mockAuditService as any,
        mockSaveRecord,
      );

      expect(mockSaveRecord).not.toHaveBeenCalled();
      expect(mockAuditService.log).not.toHaveBeenCalled();
    });
  });
});
