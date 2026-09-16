import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../notifications/email-service.js', () => ({
  EmailService: {
    getInstance: () => ({
      isInitialized: () => false,
      initialize: vi.fn(),
      send: vi.fn().mockResolvedValue(true),
    }),
  },
}));
vi.mock('../../utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { EnterpriseOnboardingService } from '../enterprise-onboarding-service.js';
import { EnterpriseTier } from '../../../shared/types/license';

describe('EnterpriseOnboardingService', () => {
  const svc = EnterpriseOnboardingService.getInstance();

  it('rejects invalid email', async () => {
    await expect(
      svc.submitInquiry({
        email: 'not-an-email',
        companyName: 'TestCo',
        contactName: 'Alice',
        tier: 'pro',
        useCase: 'Testing invalid email path in service',
      })
    ).rejects.toThrow('Invalid email address');
  });

  it('rejects empty company name', async () => {
    await expect(
      svc.submitInquiry({
        email: 'valid@corp.com',
        companyName: '   ',
        contactName: 'Alice',
        tier: 'pro',
        useCase: 'Testing empty company name validation',
      })
    ).rejects.toThrow('Company name is required');
  });

  it('rejects too-short use case', async () => {
    await expect(
      svc.submitInquiry({
        email: 'short@corp.com',
        companyName: 'ShortCo',
        contactName: 'Alice',
        tier: 'pro',
        useCase: 'Too short',
      })
    ).rejects.toThrow('Use case description');
  });

  it('rejects invalid tier', async () => {
    await expect(
      svc.submitInquiry({
        email: 'tier@corp.com',
        companyName: 'TierCo',
        contactName: 'Alice',
        tier: 'mega' as EnterpriseTier,
        useCase: 'Testing invalid tier value in enterprise service',
      })
    ).rejects.toThrow('Invalid enterprise tier');
  });

  it('accepts valid inquiry and returns result', async () => {
    const result = await svc.submitInquiry({
      email: 'valid-full@enterprise.com',
      companyName: 'Enterprise Ltd',
      contactName: 'Grace',
      tier: 'enterprise',
      useCase: 'We need a full-featured prediction market operations platform for our fund.',
      teamSize: '25-50',
    });

    expect(result.status).toBe('received');
    expect(result.inquiryId).toMatch(/^enq_/);
    expect(result.message).toBeTruthy();
    expect(result.paperDemo).not.toBeNull();
    expect(result.paperDemo!.demoKey).toMatch(/^demo_/);
  });

  it('rejects duplicate open inquiry for same email', async () => {
    const email = 'duplicate@corp.io';
    await svc.submitInquiry({
      email,
      companyName: 'DupCo',
      contactName: 'Hank',
      tier: 'pro',
      useCase: 'First inquiry from this company to test duplicate guard.',
    });

    await expect(
      svc.submitInquiry({
        email,
        companyName: 'DupCo',
        contactName: 'Hank',
        tier: 'enterprise',
        useCase: 'Second inquiry — should be blocked by duplicate guard logic.',
      })
    ).rejects.toThrow('open enterprise inquiry already exists');
  });

  it('getInquiry returns undefined for unknown id', () => {
    expect(svc.getInquiry('enq_unknown')).toBeUndefined();
  });

  it('listInquiries returns array', () => {
    expect(Array.isArray(svc.listInquiries())).toBe(true);
  });

  it('updateInquiry patches status', async () => {
    const result = await svc.submitInquiry({
      email: 'update-svc@corp.io',
      companyName: 'UpdateSvcCo',
      contactName: 'Iris',
      tier: 'master',
      useCase: 'Testing status update through the enterprise onboarding service.',
    });

    const updated = svc.updateInquiry(result.inquiryId, { status: 'negotiating', tamAssigned: 'tam@cashclaw.cc' });
    expect(updated?.status).toBe('negotiating');
    expect(updated?.tamAssigned).toBe('tam@cashclaw.cc');
  });
});
