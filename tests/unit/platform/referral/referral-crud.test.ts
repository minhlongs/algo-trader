/**
 * Tests for referral-crud — code/track/commission CRUD plus row mappers.
 *
 * query is mocked; each function's SQL/parameters are asserted against the
 * mock, and returned rows are mapped through the real mappers to verify
 * camelCase transformation and metadata JSON parsing.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReferralCode, ReferralClick, CommissionStatus } from '../../../../src/platform/referral/types';

const { mockQuery } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
}));

vi.mock('../../../../src/shared/db/postgres-client', () => ({
  query: mockQuery,
  getDbClient: vi.fn(),
  transaction: vi.fn(),
  closeDbConnection: vi.fn(),
}));

import {
  mapReferralCode,
  mapReferralClick,
  createReferralCode,
  getReferralCodeByTenant,
  getReferralCodeByCode,
  isReferralCodeValid,
  incrementUsedCount,
  trackClick,
  markConversion,
  getTrackingById,
  updateTrackingRevenue,
  createCommission,
  updateCommissionStatus,
} from '../../../../src/platform/referral/referral-crud';

function codeRow(code = 'ABC-DEFGH', tenantId = 'tenant-1'): Record<string, unknown> {
  return {
    code,
    tenant_id: tenantId,
    created_at: new Date('2026-01-01'),
    is_active: true,
    max_uses: null,
    used_count: 3,
  };
}

function clickRow(id = 'click-1'): Record<string, unknown> {
  return {
    id,
    referral_code: 'ABC-DEFGH',
    clicked_by_ip: '10.0.0.1',
    clicked_by_user_agent: 'Mozilla',
    clicked_at: new Date('2026-01-02'),
    converted_at: null,
    converted_tenant_id: null,
    converted_user_id: null,
    revenue_generated: 0,
    commission_calculated: 0,
    fraud_score: 0,
    is_fraudulent: false,
    metadata: '{"source":"utm_test"}',
  };
}

describe('mapReferralCode', () => {
  it('maps a Postgres row to the camelCase ReferralCode interface', () => {
    const code: ReferralCode = mapReferralCode(codeRow());
    expect(code).toEqual({
      code: 'ABC-DEFGH',
      tenantId: 'tenant-1',
      createdAt: new Date('2026-01-01'),
      isActive: true,
      maxUses: null,
      usedCount: 3,
    });
  });
});

describe('mapReferralClick', () => {
  it('maps a row and parses metadata JSON', () => {
    const click: ReferralClick = mapReferralClick(clickRow());
    expect(click.id).toBe('click-1');
    expect(click.code).toBe('ABC-DEFGH');
    expect(click.metadata).toEqual({ source: 'utm_test' });
  });

  it('defaults metadata to {} when the DB value is empty', () => {
    const row = { ...clickRow(), metadata: '' };
    const click = mapReferralClick(row);
    expect(click.metadata).toEqual({});
  });
});

describe('createReferralCode', () => {
  beforeEach(() => vi.clearAllMocks());

  it('inserts with used_count=0 and ON CONFLICT upsert', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await createReferralCode('CODE-1', 't1', true, 10);
    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('INSERT INTO referral_codes');
    expect(sql).toContain('ON CONFLICT (tenant_id)');
    expect(params).toEqual(['CODE-1', 't1', true, 10]);
  });
});

describe('getReferralCodeByTenant', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns a mapped code when a row exists', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [codeRow()] });
    const code = await getReferralCodeByTenant('tenant-1');
    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('WHERE tenant_id = $1');
    expect(params).toEqual(['tenant-1']);
    expect(code?.code).toBe('ABC-DEFGH');
  });

  it('returns null when no row matches', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    expect(await getReferralCodeByTenant('tenant-1')).toBeNull();
  });
});

describe('getReferralCodeByCode', () => {
  beforeEach(() => vi.clearAllMocks());

  it('queries by code and maps the row', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [codeRow('XYZ-123', 't2')] });
    const code = await getReferralCodeByCode('XYZ-123');
    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('WHERE code = $1');
    expect(params).toEqual(['XYZ-123']);
    expect(code?.code).toBe('XYZ-123');
    expect(code?.tenantId).toBe('t2');
  });

  it('returns null when no row matches', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    expect(await getReferralCodeByCode('NOPE')).toBeNull();
  });
});

describe('isReferralCodeValid', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns true when a matching active row exists', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ one: 1 }] });
    expect(await isReferralCodeValid('ABC-DEFGH')).toBe(true);
    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('is_active = true');
    expect(sql).toContain('max_uses IS NULL OR used_count < max_uses');
    expect(params).toEqual(['ABC-DEFGH']);
  });

  it('returns false when no row matches', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    expect(await isReferralCodeValid('ABC-DEFGH')).toBe(false);
  });
});

describe('incrementUsedCount', () => {
  beforeEach(() => vi.clearAllMocks());

  it('updates used_count by 1', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await incrementUsedCount('ABC-DEFGH');
    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('used_count = used_count + 1');
    expect(params).toEqual(['ABC-DEFGH']);
  });
});

describe('trackClick', () => {
  beforeEach(() => vi.clearAllMocks());

  it('inserts a click row and returns the id', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'click-99' }] });
    const id = await trackClick('ABC-DEFGH', '10.0.0.1', 'Mozilla', { utm: 'web' }, 0.5, false);
    expect(id).toBe('click-99');
    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('INSERT INTO referral_tracking');
    expect(sql).toContain('RETURNING id');
    expect(params).toEqual(['ABC-DEFGH', '10.0.0.1', 'Mozilla', '{"utm":"web"}', 0.5, false]);
  });
});

describe('markConversion', () => {
  beforeEach(() => vi.clearAllMocks());

  it('updates converted_at and foreign-key columns', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await markConversion('click-1', 'tenant-2', 'user-3');
    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('SET converted_at = NOW()');
    expect(sql).toContain('converted_tenant_id = $1');
    expect(sql).toContain('converted_user_id = $2');
    expect(sql).toContain('WHERE id = $3');
    expect(params).toEqual(['tenant-2', 'user-3', 'click-1']);
  });
});

describe('getTrackingById', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns a mapped click when a row exists', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [clickRow('click-5')] });
    const click = await getTrackingById('click-5');
    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('WHERE id = $1');
    expect(params).toEqual(['click-5']);
    expect(click?.id).toBe('click-5');
    expect(click?.metadata).toEqual({ source: 'utm_test' });
  });

  it('returns null when no row matches', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    expect(await getTrackingById('nope')).toBeNull();
  });
});

describe('updateTrackingRevenue', () => {
  beforeEach(() => vi.clearAllMocks());

  it('updates revenue_generated and commission_calculated', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await updateTrackingRevenue('click-1', 100, 10);
    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('revenue_generated = $1');
    expect(sql).toContain('commission_calculated = $2');
    expect(sql).toContain('WHERE id = $3');
    expect(params).toEqual([100, 10, 'click-1']);
  });
});

describe('createCommission', () => {
  beforeEach(() => vi.clearAllMocks());

  it('inserts a commission row and returns the id', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'rc-1' }] });
    const status: CommissionStatus = 'pending';
    const id = await createCommission('t1', 'click-1', 50, 5, new Date('2026-01-01'), new Date('2026-01-31'), status);
    expect(id).toBe('rc-1');
    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('INSERT INTO referral_commissions');
    expect(sql).toContain('RETURNING id');
    expect(params).toEqual(['t1', 'click-1', 50, 5, new Date('2026-01-01'), new Date('2026-01-31'), 'pending']);
  });

  it('defaults status to pending when omitted', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'rc-2' }] });
    await createCommission('t1', 'click-1', 10, 5, new Date(), new Date());
    const [, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(params[6]).toBe('pending');
  });
});

describe('updateCommissionStatus', () => {
  beforeEach(() => vi.clearAllMocks());

  it('sets status and stripe payout id (nullable)', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await updateCommissionStatus('rc-1', 'paid', 'payout-abc');
    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('SET status = $1');
    expect(sql).toContain("paid_at = CASE WHEN $1 = 'paid' THEN NOW()");
    expect(sql).toContain('stripe_payout_id = $2');
    expect(sql).toContain('WHERE id = $3');
    expect(params).toEqual(['paid', 'payout-abc', 'rc-1']);
  });

  it('passes null when stripePayoutId is omitted', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await updateCommissionStatus('rc-1', 'cancelled');
    const [, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(params).toEqual(['cancelled', null, 'rc-1']);
  });
});
