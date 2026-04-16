/**
 * Enterprise Onboarding Tests
 * Covers: inquiry store CRUD, validation, duplicate guard,
 * TAM notifier (mocked email), paper-demo provisioner,
 * and full orchestration via EnterpriseOnboardingService.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── mock EmailService before importing modules that use it ──
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

import {
  enterpriseInquiryStore,
  ENTERPRISE_ACV,
  ENTERPRISE_TIER_LABELS,
  type EnterpriseTier,
} from '../enterprise-inquiry-store.js';
import { notifyTam } from '../enterprise-tam-notifier.js';
import { provisionPaperDemo } from '../enterprise-paper-demo-provisioner.js';
import { EnterpriseOnboardingService } from '../enterprise-onboarding-service.js';

// Reset singleton store state between tests by rebuilding a fresh instance
// via the public API (no private access needed — store is additive-only in tests)

describe('enterprise-inquiry-store', () => {
  it('creates inquiry with correct defaults', () => {
    const inq = enterpriseInquiryStore.create({
      email: 'test@acme.com',
      companyName: 'Acme Corp',
      contactName: 'Alice',
      tier: 'growth',
      useCase: 'Automate prediction market operations',
    });

    expect(inq.id).toMatch(/^enq_/);
    expect(inq.status).toBe('new');
    expect(inq.paperdemoProvisioned).toBe(false);
    expect(inq.email).toBe('test@acme.com');
    expect(inq.tier).toBe('growth');
    expect(typeof inq.createdAt).toBe('string');
  });

  it('retrieves inquiry by id', () => {
    const inq = enterpriseInquiryStore.create({
      email: 'byid@corp.io',
      companyName: 'Corp',
      contactName: 'Bob',
      tier: 'scale',
      useCase: 'Scale our trading ops',
    });
    expect(enterpriseInquiryStore.getById(inq.id)).toEqual(inq);
  });

  it('returns undefined for unknown id', () => {
    expect(enterpriseInquiryStore.getById('enq_nonexistent')).toBeUndefined();
  });

  it('updates status and paperdemo fields', () => {
    const inq = enterpriseInquiryStore.create({
      email: 'update@corp.io',
      companyName: 'UpdateCo',
      contactName: 'Carol',
      tier: 'unlimited',
      useCase: 'Full platform for hedge fund desk',
    });
    const updated = enterpriseInquiryStore.update(inq.id, {
      status: 'tam_notified',
      tamAssigned: 'john.doe@cashclaw.cc',
      paperdemoProvisioned: true,
      paperdemoKey: 'demo_abc123',
    });
    expect(updated?.status).toBe('tam_notified');
    expect(updated?.tamAssigned).toBe('john.doe@cashclaw.cc');
    expect(updated?.paperdemoProvisioned).toBe(true);
    expect(updated?.paperdemoKey).toBe('demo_abc123');
  });

  it('list returns inquiries sorted newest first', () => {
    const a = enterpriseInquiryStore.create({
      email: 'a@sort.test', companyName: 'A', contactName: 'A',
      tier: 'growth', useCase: 'sort test A',
    });
    const b = enterpriseInquiryStore.create({
      email: 'b@sort.test', companyName: 'B', contactName: 'B',
      tier: 'scale', useCase: 'sort test B',
    });
    const list = enterpriseInquiryStore.list();
    const ids = list.map((i) => i.id);
    // b was created after a — should appear first
    expect(ids.indexOf(b.id)).toBeLessThanOrEqual(ids.indexOf(a.id));
  });
});

describe('ENTERPRISE_ACV constants', () => {
  it('has correct ACV values', () => {
    expect(ENTERPRISE_ACV.growth).toBe(49_000);
    expect(ENTERPRISE_ACV.scale).toBe(199_000);
    expect(ENTERPRISE_ACV.unlimited).toBe(499_000);
  });

  it('has label for every tier', () => {
    const tiers: EnterpriseTier[] = ['growth', 'scale', 'unlimited'];
    for (const t of tiers) {
      expect(ENTERPRISE_TIER_LABELS[t]).toBeTruthy();
    }
  });
});

describe('notifyTam', () => {
  it('returns false when EmailService not initialised (graceful degradation)', async () => {
    const inq = enterpriseInquiryStore.create({
      email: 'tam-test@corp.com', companyName: 'TamCo', contactName: 'Dave',
      tier: 'growth', useCase: 'TAM notification test case',
    });
    // EmailService mock returns isInitialized: false → should not throw, returns false
    const result = await notifyTam(inq);
    expect(result).toBe(false);
  });
});

describe('provisionPaperDemo', () => {
  it('returns credentials with correct shape', async () => {
    const inq = enterpriseInquiryStore.create({
      email: 'demo@prospect.com', companyName: 'ProspectCo', contactName: 'Eve',
      tier: 'scale', useCase: 'Paper demo provisioning test case',
    });
    const creds = await provisionPaperDemo(inq);
    expect(creds).not.toBeNull();
    expect(creds!.demoKey).toMatch(/^demo_[a-f0-9]{32}$/);
    expect(creds!.expiresAt).toBeTruthy();
    expect(new Date(creds!.expiresAt).getTime()).toBeGreaterThan(Date.now());
    expect(creds!.dashboardUrl).toContain(creds!.demoKey);
    expect(creds!.docsUrl).toBeTruthy();
  });

  it('expiry is ~30 days from now', async () => {
    const inq = enterpriseInquiryStore.create({
      email: 'expiry@prospect.com', companyName: 'ExpiryCo', contactName: 'Frank',
      tier: 'unlimited', useCase: 'Expiry check for paper demo',
    });
    const before = Date.now();
    const creds = await provisionPaperDemo(inq);
    const expiryMs = new Date(creds!.expiresAt).getTime();
    const days = (expiryMs - before) / (1000 * 60 * 60 * 24);
    expect(days).toBeGreaterThanOrEqual(29.9);
    expect(days).toBeLessThanOrEqual(30.1);
  });
});

describe('EnterpriseOnboardingService', () => {
  const svc = EnterpriseOnboardingService.getInstance();

  it('rejects invalid email', async () => {
    await expect(
      svc.submitInquiry({
        email: 'not-an-email',
        companyName: 'TestCo',
        contactName: 'Alice',
        tier: 'growth',
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
        tier: 'growth',
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
        tier: 'growth',
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
      tier: 'scale',
      useCase: 'We need a full-featured prediction market operations platform for our fund.',
      teamSize: '25-50',
    });

    expect(result.status).toBe('received');
    expect(result.inquiryId).toMatch(/^enq_/);
    expect(result.message).toBeTruthy();
    // paperDemo: EmailService is mocked as not-initialised so email skipped,
    // but provisioner still returns credentials
    expect(result.paperDemo).not.toBeNull();
    expect(result.paperDemo!.demoKey).toMatch(/^demo_/);
  });

  it('rejects duplicate open inquiry for same email', async () => {
    const email = 'duplicate@corp.io';
    await svc.submitInquiry({
      email,
      companyName: 'DupCo',
      contactName: 'Hank',
      tier: 'growth',
      useCase: 'First inquiry from this company to test duplicate guard.',
    });

    await expect(
      svc.submitInquiry({
        email,
        companyName: 'DupCo',
        contactName: 'Hank',
        tier: 'scale',
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
      tier: 'unlimited',
      useCase: 'Testing status update through the enterprise onboarding service.',
    });

    const updated = svc.updateInquiry(result.inquiryId, { status: 'negotiating', tamAssigned: 'tam@cashclaw.cc' });
    expect(updated?.status).toBe('negotiating');
    expect(updated?.tamAssigned).toBe('tam@cashclaw.cc');
  });
});
