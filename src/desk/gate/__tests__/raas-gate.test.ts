/**
 * RaaS Gate Tests
 * ROIaaS - Revenue-as-a-Service License Gating tests (enforcement & class suite)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import RaasGate, {
  LicenseError,
  validateLicense as validate,
  requireTier as require,
} from '../raas-gate';
import { LicenseService } from '../../../platform/billing/license-service';
import { LicenseTier, LicenseStatus, License } from '../../../shared/types/license';

describe('raas-gate enforcement', () => {
  describe('validateLicense', () => {
    it('should not throw for valid license with sufficient tier', () => {
      const license: License = {
        id: 'lic_test',
        key: 'RAAS-RPP-TEST1234-KEY5678',
        name: 'Test License',
        tier: LicenseTier.PRO,
        status: LicenseStatus.ACTIVE,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        usageCount: 0,
        maxUsage: 10000,
      };

      expect(() => validate(license, 'ml_strategies')).not.toThrow();
    });

    it('should throw LicenseError when license is undefined', () => {
      expect(() => validate(undefined, 'ml_strategies')).toThrow(LicenseError);
    });

    it('should throw LicenseError when license is not active', () => {
      const license: License = {
        id: 'lic_test',
        key: 'RAAS-FREE-TEST1234-KEY5678',
        name: 'Inactive License',
        tier: LicenseTier.FREE,
        status: LicenseStatus.REVOKED,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        usageCount: 0,
        maxUsage: 100,
      };

      expect(() => validate(license, 'basic_strategies')).toThrow(LicenseError);
    });

    it('should throw LicenseError with insufficient tier', () => {
      const license: License = {
        id: 'lic_test',
        key: 'RAAS-FREE-TEST1234-KEY5678',
        name: 'Free License',
        tier: LicenseTier.FREE,
        status: LicenseStatus.ACTIVE,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        usageCount: 0,
        maxUsage: 100,
      };

      expect(() => validate(license, 'ml_strategies')).toThrow(LicenseError);
    });
  });

  describe('requireTier', () => {
    it('should not throw when license meets required tier', () => {
      const license: License = {
        id: 'lic_test',
        key: 'RAAS-REP-TEST1234-KEY5678',
        name: 'Enterprise License',
        tier: LicenseTier.ENTERPRISE,
        status: LicenseStatus.ACTIVE,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        usageCount: 0,
        maxUsage: 100000,
      };

      expect(() => require(license, LicenseTier.PRO, 'test_feature')).not.toThrow();
    });

    it('should throw LicenseError when license tier is insufficient', () => {
      const license: License = {
        id: 'lic_test',
        key: 'RAAS-FREE-TEST1234-KEY5678',
        name: 'Free License',
        tier: LicenseTier.FREE,
        status: LicenseStatus.ACTIVE,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        usageCount: 0,
        maxUsage: 100,
      };

      expect(() => require(license, LicenseTier.ENTERPRISE, 'premium_feature')).toThrow(
        LicenseError
      );
    });

    it('should throw LicenseError when license is undefined', () => {
      expect(() => require(undefined, LicenseTier.PRO, 'feature')).toThrow(LicenseError);
    });
  });

  describe('RaasGate class', () => {
    let gate: RaasGate;
    let licenseService: LicenseService;

    beforeEach(() => {
      gate = RaasGate.getInstance();
      licenseService = gate.getLicenseService();
      (licenseService as unknown as { licenses: Map<string, unknown> }).licenses.clear();
    });

    describe('validateApiKey', () => {
      it('should return undefined for invalid key', async () => {
        await licenseService.createLicense({
          name: 'Test',
          tier: LicenseTier.PRO,
        });

        const result = gate.validateApiKey('INVALID-KEY');
        expect(result).toBeUndefined();
      });
    });

    describe('hasAccess', () => {
      it('should return true for valid license with feature access', async () => {
        const license = await licenseService.createLicense({
          name: 'PRO License',
          tier: LicenseTier.PRO,
        });

        expect(gate.hasAccess(license, 'ml_strategies')).toBe(true);
      });

      it('should return false for license without feature access', async () => {
        const license = await licenseService.createLicense({
          name: 'FREE License',
          tier: LicenseTier.FREE,
        });

        expect(gate.hasAccess(license, 'ml_strategies')).toBe(false);
      });

      it('should return false for undefined license', () => {
        expect(gate.hasAccess(undefined, 'basic_strategies')).toBe(false);
      });
    });
  });
});
