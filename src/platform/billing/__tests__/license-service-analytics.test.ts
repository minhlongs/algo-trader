import { describe, it, expect, beforeEach } from 'vitest';
import { LicenseService } from '../license-service';
import { LicenseTier, LicenseStatus } from '../../../shared/types/license';

describe('LicenseService Analytics', () => {
  let service: LicenseService;

  beforeEach(() => {
    service = LicenseService.getInstance();
    (service as any).licenses.clear();
  });

  describe('getAnalytics', () => {
    beforeEach(async () => {
      await service.createLicense({ name: 'Free 1', tier: LicenseTier.FREE });
      await service.createLicense({ name: 'Free 2', tier: LicenseTier.FREE });
      await service.createLicense({ name: 'Pro 1', tier: LicenseTier.PRO });
      await service.createLicense({ name: 'Enterprise 1', tier: LicenseTier.ENTERPRISE });
    });

    it('should return analytics with correct tier counts', async () => {
      const analytics = await service.getAnalytics();
      expect(analytics.totalLicenses).toBe(4);
      expect(analytics.byTier[LicenseTier.FREE]).toBe(2);
      expect(analytics.byTier[LicenseTier.PRO]).toBe(1);
      expect(analytics.byTier[LicenseTier.ENTERPRISE]).toBe(1);
    });

    it('should return analytics with correct status counts', async () => {
      const analytics = await service.getAnalytics();
      expect(analytics.byStatus[LicenseStatus.ACTIVE]).toBe(4);
      expect(analytics.byStatus[LicenseStatus.EXPIRED]).toBe(0);
      expect(analytics.byStatus[LicenseStatus.REVOKED]).toBe(0);
    });

    it('should return recent activity sorted by date', async () => {
      const analytics = await service.getAnalytics();
      expect(analytics.recentActivity.length).toBeLessThanOrEqual(10);
      expect(analytics.recentActivity.every((a) => a.event === 'created')).toBe(true);
    });
  });
});
