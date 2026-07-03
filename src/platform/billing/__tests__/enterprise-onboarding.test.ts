/**
 * Enterprise Onboarding Tests
 * Covers: inquiry store CRUD, validation, duplicate guard,
 * TAM notifier (mocked email), paper-demo provisioner,
 * and full orchestration via EnterpriseOnboardingService.
 *
 * Storage: PostgreSQL via postgres-client (mocked)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── mock EmailService before importing modules that use it ──
vi.mock('../../notifications', () => ({
  EmailService: {
    getInstance: () => ({
      isInitialized: () => false,
      initialize: vi.fn(),
      send: vi.fn().mockResolvedValue(true),
    }),
  },
}));

vi.mock('../../../shared/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const { mockData, mockQuery } = vi.hoisted(() => {
  const data = new Map<string, Record<string, any>>();
  const fn = vi.fn((text: string, params?: any[]) => {
    // INSERT INTO enterprise_inquiries
    if (text.startsWith('INSERT INTO enterprise_inquiries')) {
      const row: Record<string, any> = {
        id: params![0],
        email: params![1],
        company_name: params![2],
        contact_name: params![3],
        tier: params![4],
        use_case: params![5],
        team_size: params![6],
        status: params![7],
        paperdemo_provisioned: params![8],
        created_at: new Date(),
        updated_at: new Date(),
        tam_assigned: null,
        paperdemo_key: null,
        notes: null,
      };
      data.set(row.id, row);
      return { rows: [row] };
    }
    // SELECT by id
    if (text === 'SELECT * FROM enterprise_inquiries WHERE id = $1') {
      const row = data.get(params![0]);
      return { rows: row ? [row] : [] };
    }
    // SELECT by email
    if (text === 'SELECT * FROM enterprise_inquiries WHERE email = $1 ORDER BY created_at DESC') {
      const rows = [...data.values()].filter((r: any) => r.email === params![0]);
      return { rows };
    }
    // SELECT all
    if (text === 'SELECT * FROM enterprise_inquiries ORDER BY created_at DESC') {
      return { rows: [...data.values()].sort((a: any, b: any) => b.created_at - a.created_at) };
    }
    // UPDATE
    if (text.startsWith('UPDATE enterprise_inquiries SET')) {
      const row = data.get(params![params!.length - 1]); // last param is id
      if (row) {
        // Parse SET clauses
        const setPart = text.match(/SET (.+?) WHERE/)?.[1] || '';
        const setClauses = setPart.split(',').map(s => s.trim());
        let paramIdx = 0;
        for (const clause of setClauses) {
          const col = clause.split('=')[0].trim();
          if (col === 'updated_at') {
            // skip, handled by param
            paramIdx++;
            continue;
          }
          const val = params![paramIdx];
          row[col] = val;
          paramIdx++;
        }
      }
      return { rows: row ? [row] : [] };
    }
    return { rows: [] };
  });
  return { mockData: data, mockQuery: fn };
});

vi.mock('../../../shared/db/postgres-client', () => ({
  query: mockQuery,
}));

import {
  enterpriseInquiryStore,
  ENTERPRISE_MONTHLY_PRICE,
  ENTERPRISE_TIER_LABELS,
  type EnterpriseTier,
} from '../enterprise-inquiry-store';
import { notifyTam } from '../enterprise-tam-notifier';
import { provisionPaperDemo } from '../enterprise-paper-demo-provisioner';
import { EnterpriseOnboardingService } from '../enterprise-onboarding-service';

describe('enterprise-inquiry-store', () => {
  beforeEach(() => {
    mockData.clear();
    mockQuery.mockClear();
  });

  it('creates inquiry with correct defaults', async () => {
    const inq = await enterpriseInquiryStore.create({
      email: 'test@acme.com',
      companyName: 'Acme Corp',
      contactName: 'Alice',
      tier: 'PRO',
      useCase: 'Automate prediction market operations',
    });

    expect(inq.id).toMatch(/^enq_/);
    expect(inq.status).toBe('new');
    expect(inq.paperdemoProvisioned).toBe(false);
    expect(inq.email).toBe('test@acme.com');
    expect(inq.tier).toBe('PRO');
    expect(typeof inq.createdAt).toBe('string');
  });

  it('retrieves inquiry by id', async () => {
    const inq = await enterpriseInquiryStore.create({
      email: 'byid@corp.io',
      companyName: 'Corp',
      contactName: 'Bob',
      tier: 'ENTERPRISE',
      useCase: 'Scale our trading ops',
    });
    const retrieved = await enterpriseInquiryStore.getById(inq.id);
    expect(retrieved).toEqual(inq);
  });

  it('returns undefined for unknown id', async () => {
    const result = await enterpriseInquiryStore.getById('enq_nonexistent');
    expect(result).toBeUndefined();
  });

  it('updates status and paperdemo fields', async () => {
    const inq = await enterpriseInquiryStore.create({
      email: 'update@corp.io',
      companyName: 'UpdateCo',
      contactName: 'Carol',
      tier: 'MASTER',
      useCase: 'Full platform for hedge fund desk',
    });
    const updated = await enterpriseInquiryStore.update(inq.id, {
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

  it('list returns inquiries sorted newest first (descending createdAt)', async () => {
    const a = await enterpriseInquiryStore.create({
      email: 'a@sort.test', companyName: 'A', contactName: 'A',
      tier: 'PRO', useCase: 'sort test A',
    });
    const b = await enterpriseInquiryStore.create({
      email: 'b@sort.test', companyName: 'B', contactName: 'B',
      tier: 'ENTERPRISE', useCase: 'sort test B',
    });
    const list = await enterpriseInquiryStore.list();
    const ids = list.map((i) => i.id);
    expect(ids).toContain(a.id);
    expect(ids).toContain(b.id);
    for (let i = 0; i < list.length - 1; i++) {
      expect(list[i]!.createdAt >= list[i + 1]!.createdAt).toBe(true);
    }
  });
});

describe('ENTERPRISE_MONTHLY_PRICE constants', () => {
  it('has correct monthly price values', () => {
    expect(ENTERPRISE_MONTHLY_PRICE.PRO).toBe(99);
    expect(ENTERPRISE_MONTHLY_PRICE.ENTERPRISE).toBe(299);
    expect(ENTERPRISE_MONTHLY_PRICE.MASTER).toBe(999);
  });

  it('has label for every tier', () => {
    const tiers: EnterpriseTier[] = ['PRO', 'ENTERPRISE', 'MASTER'];
    for (const t of tiers) {
      expect(ENTERPRISE_TIER_LABELS[t]).toBeTruthy();
    }
  });
});

describe('notifyTam', () => {
  beforeEach(() => {
    mockData.clear();
    mockQuery.mockClear();
  });

  it('returns false when EmailService not initialised (graceful degradation)', async () => {
    const inq = await enterpriseInquiryStore.create({
      email: 'tam-test@corp.com', companyName: 'TamCo', contactName: 'Dave',
      tier: 'PRO', useCase: 'TAM notification test case',
    });
    const result = await notifyTam(inq);
    expect(result).toBe(false);
  });
});

describe('provisionPaperDemo', () => {
  beforeEach(() => {
    mockData.clear();
    mockQuery.mockClear();
  });

  it('returns credentials with correct shape', async () => {
    const inq = await enterpriseInquiryStore.create({
      email: 'demo@prospect.com', companyName: 'ProspectCo', contactName: 'Eve',
      tier: 'ENTERPRISE', useCase: 'Paper demo provisioning test case',
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
    const inq = await enterpriseInquiryStore.create({
      email: 'expiry@prospect.com', companyName: 'ExpiryCo', contactName: 'Frank',
      tier: 'MASTER', useCase: 'Expiry check for paper demo',
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

  beforeEach(() => {
    mockData.clear();
    mockQuery.mockClear();
  });

  it('rejects invalid email', async () => {
    await expect(
      svc.submitInquiry({
        email: 'not-an-email',
        companyName: 'TestCo',
        contactName: 'Alice',
        tier: 'PRO',
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
        tier: 'PRO',
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
        tier: 'PRO',
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
      tier: 'ENTERPRISE',
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
      tier: 'PRO',
      useCase: 'First inquiry from this company to test duplicate guard.',
    });

    await expect(
      svc.submitInquiry({
        email,
        companyName: 'DupCo',
        contactName: 'Hank',
        tier: 'ENTERPRISE',
        useCase: 'Second inquiry — should be blocked by duplicate guard logic.',
      })
    ).rejects.toThrow('open enterprise inquiry already exists');
  });

  it('getInquiry returns undefined for unknown id', async () => {
    const result = await svc.getInquiry('enq_unknown');
    expect(result).toBeUndefined();
  });

  it('listInquiries returns array', async () => {
    const result = await svc.listInquiries();
    expect(Array.isArray(result)).toBe(true);
  });

  it('updateInquiry patches status', async () => {
    const result = await svc.submitInquiry({
      email: 'update-svc@corp.io',
      companyName: 'UpdateSvcCo',
      contactName: 'Iris',
      tier: 'MASTER',
      useCase: 'Testing status update through the enterprise onboarding service.',
    });

    const updated = await svc.updateInquiry(result.inquiryId, { status: 'negotiating', tamAssigned: 'tam@cashclaw.cc' });
    expect(updated?.status).toBe('negotiating');
    expect(updated?.tamAssigned).toBe('tam@cashclaw.cc');
  });
});
