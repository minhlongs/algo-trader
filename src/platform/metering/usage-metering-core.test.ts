/**
 * UsageMeteringService Core Tests: Constants, status, resets, retention, DB integration.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { UsageMeteringService, DAILY_LIMITS, OVERAGE_PRICE_PER_CALL } from './usage-metering-service';
import { LicenseTier } from '../../shared/types/license';

vi.mock('../../shared/db/postgres-client', () => ({ query: vi.fn() }));
vi.mock('../../redis', () => ({
  getRedisClient: vi.fn(() => ({ incr: vi.fn().mockResolvedValue(1), expire: vi.fn().mockResolvedValue(true) })),
}));
vi.mock('../../shared/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

describe('UsageMeteringService - Core', () => {
  let service: UsageMeteringService;

  beforeEach(() => {
    service = UsageMeteringService.getInstance();
    service['dailyUsage'].clear();
    service['alertedThresholds'].clear();
    vi.clearAllMocks();
  });

  describe('Constants', () => {
    it('should have correct daily limits per tier', () => {
      expect(DAILY_LIMITS[LicenseTier.FREE]).toBe(100);
      expect(DAILY_LIMITS[LicenseTier.PRO]).toBe(10000);
      expect(DAILY_LIMITS[LicenseTier.ENTERPRISE]).toBe(100000);
    });

    it('should have correct overage prices per tier', () => {
      expect(OVERAGE_PRICE_PER_CALL[LicenseTier.FREE]).toBe(0);
      expect(OVERAGE_PRICE_PER_CALL[LicenseTier.PRO]).toBe(0.01);
      expect(OVERAGE_PRICE_PER_CALL[LicenseTier.ENTERPRISE]).toBe(0.005);
    });
  });

  describe('getUsageStatus', () => {
    it('should return correct usage status for zero usage', () => {
      const licenseKey = 'ZERO-USAGE-TEST';
      const tier = LicenseTier.PRO;
      const usageStatus = service.getUsageStatus(licenseKey, tier);

      expect(usageStatus.currentUsage).toBe(0);
      expect(usageStatus.remaining).toBe(10000);
      expect(usageStatus.percentUsed).toBe(0);
    });

    it('should calculate percent used correctly', () => {
      const licenseKey = 'PERCENT-TEST';
      const tier = LicenseTier.FREE;
      service['dailyUsage'].set(licenseKey, new Map([[service.getCurrentDate(), 50]]));

      const status = service.getUsageStatus(licenseKey, tier);
      expect(status.percentUsed).toBe(50);
    });

    it('should handle usage across different tiers', () => {
      const freeLicense = 'FREE-TIER';
      const proLicense = 'PRO-TIER';
      const enterpriseLicense = 'ENT-TIER';

      service['dailyUsage'].set(freeLicense, new Map([[service.getCurrentDate(), 50]]));
      service['dailyUsage'].set(proLicense, new Map([[service.getCurrentDate(), 5000]]));
      service['dailyUsage'].set(enterpriseLicense, new Map([[service.getCurrentDate(), 50000]]));

      expect(service.getUsageStatus(freeLicense, LicenseTier.FREE).percentUsed).toBe(50);
      expect(service.getUsageStatus(proLicense, LicenseTier.PRO).percentUsed).toBe(50);
      expect(service.getUsageStatus(enterpriseLicense, LicenseTier.ENTERPRISE).percentUsed).toBe(50);
    });
  });

  describe('resetDailyUsage', () => {
    it('should reset usage for specific license', () => {
      const licenseKey = 'RESET-TEST';
      const date = new Date().toISOString().split('T')[0];

      service['dailyUsage'].set(licenseKey, new Map([[date, 100]]));
      expect(service.getTodayUsage(licenseKey)).toBe(100);

      service.resetDailyUsage(licenseKey);
      expect(service.getTodayUsage(licenseKey)).toBe(0);
    });

    it('should clear threshold alerts on reset', () => {
      const licenseKey = 'ALERT-RESET-TEST';
      const tier = LicenseTier.FREE;

      service['dailyUsage'].set(licenseKey, new Map([[service.getCurrentDate(), 80]]));
      const status = service.getUsageStatus(licenseKey, tier);
      service.checkThresholds(licenseKey, status);

      expect(service['alertedThresholds'].has(licenseKey)).toBe(true);
      service.resetDailyUsage(licenseKey);
      expect(service['alertedThresholds'].has(licenseKey)).toBe(false);
    });
  });

  describe('cleanupOldData', () => {
    it('should remove old entries beyond retention period', () => {
      const licenseKey = 'CLEANUP-TEST';
      const today = new Date();
      const oldDate = new Date(today);
      oldDate.setDate(oldDate.getDate() - 35);
      const oldDateStr = oldDate.toISOString().split('T')[0];
      const recentDateStr = today.toISOString().split('T')[0];

      service['dailyUsage'].set(licenseKey, new Map([[oldDateStr, 100], [recentDateStr, 50]]));
      service.cleanupOldData(30);
      expect(service.getTodayUsage(licenseKey)).toBe(50);
    });
  });

  describe('getMemoryUsage', () => {
    it('should return correct memory stats', () => {
      service['dailyUsage'].set('LIC1', new Map([['2025-06-20', 100]]));
      service['dailyUsage'].set('LIC2', new Map([['2025-06-20', 200]]));
      service['dailyUsage'].set('LIC3', new Map([['2025-06-20', 300], ['2025-06-19', 150]]));

      const usage = service.getMemoryUsage();
      expect(usage.licenseKeys).toBe(3);
      expect(usage.totalEntries).toBe(4);
    });
  });

  describe('Integration with database', () => {
    it('should call persistDailyUsage when tracking API calls', async () => {
      const { query } = await import('../../shared/db/postgres-client');
      vi.mocked(query).mockResolvedValue({ rows: [] } as any);

      const licenseKey = 'DB-PERSIST-TEST';
      const tier = LicenseTier.PRO;

      await service.trackApiCall(licenseKey, tier, '/api/test');

      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO license_usage_daily'),
        expect.arrayContaining([licenseKey, expect.anything(), tier, 1, expect.anything(), expect.anything()])
      );
    });

    it('should handle database errors gracefully', async () => {
      const { query } = await import('../../shared/db/postgres-client');
      vi.mocked(query).mockRejectedValue(new Error('DB connection failed'));

      const licenseKey = 'DB-ERROR-TEST';
      const tier = LicenseTier.FREE;

      await service.trackApiCall(licenseKey, tier);
      expect(query).toHaveBeenCalled();
    });
  });
});
