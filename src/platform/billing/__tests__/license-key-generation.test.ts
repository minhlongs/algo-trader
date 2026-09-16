import { describe, it, expect, beforeEach } from 'vitest';
import { LicenseService } from '../license-service';
import { LicenseTier } from '../../../shared/types/license';

describe('generateLicenseKey', () => {
  let service: LicenseService;

  beforeEach(() => {
    service = LicenseService.getInstance();
    (service as any).licenses.clear();
  });

  it('should generate license key with FREE tier prefix', () => {
    const key = service.generateLicenseKey(LicenseTier.FREE);
    expect(key).toMatch(/^RAAS-FREE-[A-Z0-9]{8}-[A-Z0-9]{8}$/);
  });

  it('should generate license key with STARTER tier prefix', () => {
    const key = service.generateLicenseKey(LicenseTier.STARTER);
    expect(key).toMatch(/^RAAS-RST-[A-Z0-9]{8}-[A-Z0-9]{8}$/);
  });

  it('should generate license key with PRO tier prefix', () => {
    const key = service.generateLicenseKey(LicenseTier.PRO);
    expect(key).toMatch(/^RAAS-RPP-[A-Z0-9]{8}-[A-Z0-9]{8}$/);
  });

  it('should generate license key with ENTERPRISE tier prefix', () => {
    const key = service.generateLicenseKey(LicenseTier.ENTERPRISE);
    expect(key).toMatch(/^RAAS-REP-[A-Z0-9]{8}-[A-Z0-9]{8}$/);
  });

  it('should generate unique keys for multiple calls', () => {
    const keys = new Set();
    for (let i = 0; i < 10; i++) {
      keys.add(service.generateLicenseKey(LicenseTier.PRO));
    }
    expect(keys.size).toBe(10);
  });
});
