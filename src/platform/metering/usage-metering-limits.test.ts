/**
 * UsageMeteringService Limits & Tracking Tests: trackApiCall, thresholds, overage.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { UsageMeteringService } from './usage-metering-service';
import { LicenseTier } from '../../shared/types/license';

vi.mock('../../shared/db/postgres-client', () => ({
  query: vi.fn(),
}));

vi.mock('../../redis', () => ({
  getRedisClient: vi.fn(() => ({
    incr: vi.fn().mockResolvedValue(1),
    expire: vi.fn().mockResolvedValue(true),
  })),
}));

vi.mock('../../shared/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

describe('UsageMeteringService - Limits & Call Tracking', () => {
  let service: UsageMeteringService;

  beforeEach(() => {
    service = UsageMeteringService.getInstance();
    service['dailyUsage'].clear();
    service['alertedThresholds'].clear();
    vi.clearAllMocks();
  });

  describe('trackApiCall', () => {
    it('should increment usage count for license key', async () => {
      const licenseKey = 'TEST-LICENSE-KEY';
      const tier = LicenseTier.PRO;

      const status = await service.trackApiCall(licenseKey, tier, '/api/test');

      expect(status.currentUsage).toBe(1);
      expect(status.dailyLimit).toBe(10000);
      expect(status.remaining).toBe(9999);
      expect(status.isExceeded).toBe(false);
      expect(status.overageUnits).toBe(0);
      expect(status.overageCost).toBe(0);
    });

    it('should track multiple calls correctly', async () => {
      const licenseKey = 'TEST-LICENSE-KEY-2';
      const tier = LicenseTier.FREE;

      await service.trackApiCall(licenseKey, tier);
      await service.trackApiCall(licenseKey, tier);
      await service.trackApiCall(licenseKey, tier);

      const status = service.getUsageStatus(licenseKey, tier);
      expect(status.currentUsage).toBe(3);
      expect(status.remaining).toBe(97);
    });

    it('should emit threshold alert at 80%', async () => {
      const licenseKey = 'ALERT-TEST-LICENSE';
      const tier = LicenseTier.FREE;
      const eightyPercent = 80;

      const alertPromise = new Promise<void>((resolve) => {
        service.once('threshold_alert', (alert: { licenseKey: string; threshold: number; currentUsage: number }) => {
          expect(alert.licenseKey).toBe(licenseKey);
          expect(alert.threshold).toBe(80);
          expect(alert.currentUsage).toBe(eightyPercent);
          resolve();
        });
      });

      for (let i = 0; i < eightyPercent; i++) {
        await service.trackApiCall(licenseKey, tier);
      }

      await alertPromise;
    });

    it('should not emit duplicate threshold alerts', async () => {
      const licenseKey = 'DUPLICATE-ALERT-TEST';
      const tier = LicenseTier.FREE;
      let alertCount = 0;

      service.on('threshold_alert', () => {
        alertCount++;
      });

      for (let i = 0; i < 90; i++) {
        await service.trackApiCall(licenseKey, tier);
      }

      expect(alertCount).toBe(2);
    });

    it('should mark as exceeded when usage exceeds limit', async () => {
      const licenseKey = 'EXCEED-TEST-LICENSE';
      const tier = LicenseTier.FREE;

      for (let i = 0; i < 101; i++) {
        await service.trackApiCall(licenseKey, tier);
      }

      const status = service.getUsageStatus(licenseKey, tier);
      expect(status.isExceeded).toBe(true);
      expect(status.overageUnits).toBe(1);
      expect(status.overageCost).toBe(0);
    });

    it('should calculate overage cost correctly for PRO tier', async () => {
      const licenseKey = 'OVERAGE-PRO-TEST';
      const tier = LicenseTier.PRO;

      for (let i = 0; i < 10010; i++) {
        await service.trackApiCall(licenseKey, tier);
      }

      const status = service.getUsageStatus(licenseKey, tier);
      expect(status.overageUnits).toBe(10);
      expect(status.overageCost).toBe(0.10);
    });

    it('should include endpoint and metadata in tracking', async () => {
      const licenseKey = 'METADATA-TEST';
      const tier = LicenseTier.ENTERPRISE;

      await service.trackApiCall(
        licenseKey,
        tier,
        '/api/v1/arb/execute',
        'tenant-123',
        200,
        45,
        '127.0.0.1',
        'Mozilla/5.0'
      );

      const status = service.getUsageStatus(licenseKey, tier);
      expect(status.currentUsage).toBe(1);
    });
  });
});
