/**
 * Tests for ReferralRepository facade — mocks the delegated sub-modules
 * (referral-crud, referral-analytics, cookie-attribution) to verify that
 * every method correctly forwards arguments and returns.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockCreateReferralCode, mockGetReferralCodeByTenant, mockGetReferralCodeByCode,
  mockIsReferralCodeValid, mockIncrementUsedCount, mockTrackClick, mockMarkConversion,
  mockGetTrackingById, mockUpdateTrackingRevenue, mockCreateCommission, mockUpdateCommissionStatus } = vi.hoisted(() => ({
  mockCreateReferralCode: vi.fn(),
  mockGetReferralCodeByTenant: vi.fn(),
  mockGetReferralCodeByCode: vi.fn(),
  mockIsReferralCodeValid: vi.fn(),
  mockIncrementUsedCount: vi.fn(),
  mockTrackClick: vi.fn(),
  mockMarkConversion: vi.fn(),
  mockGetTrackingById: vi.fn(),
  mockUpdateTrackingRevenue: vi.fn(),
  mockCreateCommission: vi.fn(),
  mockUpdateCommissionStatus: vi.fn(),
}));

const { mockGetClicksByCode, mockGetTrackingByTenant, mockGetReferralStats,
  mockGetCommissions, mockGetPendingCommissions } = vi.hoisted(() => ({
  mockGetClicksByCode: vi.fn(),
  mockGetTrackingByTenant: vi.fn(),
  mockGetReferralStats: vi.fn(),
  mockGetCommissions: vi.fn(),
  mockGetPendingCommissions: vi.fn(),
}));

const { mockCreateMapping, mockGetReferralCodeByHash, mockRecordAttribution } = vi.hoisted(() => ({
  mockCreateMapping: vi.fn(),
  mockGetReferralCodeByHash: vi.fn(),
  mockRecordAttribution: vi.fn(),
}));

vi.mock('../../../../src/platform/referral/referral-crud', () => ({
  createReferralCode: vi.fn((...a: unknown[]) => mockCreateReferralCode(...a)),
  getReferralCodeByTenant: vi.fn((...a: unknown[]) => mockGetReferralCodeByTenant(...a)),
  getReferralCodeByCode: vi.fn((...a: unknown[]) => mockGetReferralCodeByCode(...a)),
  isReferralCodeValid: vi.fn((...a: unknown[]) => mockIsReferralCodeValid(...a)),
  incrementUsedCount: vi.fn((...a: unknown[]) => mockIncrementUsedCount(...a)),
  trackClick: vi.fn((...a: unknown[]) => mockTrackClick(...a)),
  markConversion: vi.fn((...a: unknown[]) => mockMarkConversion(...a)),
  getTrackingById: vi.fn((...a: unknown[]) => mockGetTrackingById(...a)),
  updateTrackingRevenue: vi.fn((...a: unknown[]) => mockUpdateTrackingRevenue(...a)),
  createCommission: vi.fn((...a: unknown[]) => mockCreateCommission(...a)),
  updateCommissionStatus: vi.fn((...a: unknown[]) => mockUpdateCommissionStatus(...a)),
}));

vi.mock('../../../../src/platform/referral/referral-analytics', () => ({
  getClicksByCode: vi.fn((...a: unknown[]) => mockGetClicksByCode(...a)),
  getTrackingByTenant: vi.fn((...a: unknown[]) => mockGetTrackingByTenant(...a)),
  getReferralStats: vi.fn((...a: unknown[]) => mockGetReferralStats(...a)),
  getCommissions: vi.fn((...a: unknown[]) => mockGetCommissions(...a)),
  getPendingCommissions: vi.fn((...a: unknown[]) => mockGetPendingCommissions(...a)),
}));

vi.mock('../../../../src/platform/referral/cookie-attribution', () => ({
  cookieAttributionService: {
    createMapping: vi.fn((...a: unknown[]) => mockCreateMapping(...a)),
    getReferralCodeByHash: vi.fn((...a: unknown[]) => mockGetReferralCodeByHash(...a)),
    recordAttribution: vi.fn((...a: unknown[]) => mockRecordAttribution(...a)),
  },
}));

import { ReferralRepository, referralRepository } from '../../../../src/platform/referral/referral-repository';

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('ReferralRepository', () => {
  let repo: ReferralRepository;
  const CODE = 'ref-1';
  const TENANT = 'tenant-1';
  const TRACKING_ID = 'track-1';
  const COMMISSION_ID = 'comm-1';

  beforeEach(() => {
    vi.clearAllMocks();
    repo = new ReferralRepository();
  });

  // ── Singleton ──────────────────────────────────────
  it('exposes a module-level singleton', () => {
    expect(referralRepository).toBeInstanceOf(ReferralRepository);
  });

  // ── Code CRUD ──────────────────────────────────────
  it('createReferralCode delegates to crud with default args', async () => {
    mockCreateReferralCode.mockResolvedValueOnce('new-id');
    const result = await repo.createReferralCode(CODE, TENANT);
    expect(result).toBe('new-id');
    expect(mockCreateReferralCode).toHaveBeenCalledWith(CODE, TENANT, true, null);
  });

  it('createReferralCode forwards isActive and maxUses', async () => {
    mockCreateReferralCode.mockResolvedValueOnce(undefined);
    await repo.createReferralCode(CODE, TENANT, false, 10);
    expect(mockCreateReferralCode).toHaveBeenCalledWith(CODE, TENANT, false, 10);
  });

  it('getReferralCodeByTenant delegates to crud', async () => {
    const fake = { id: 1, code: CODE, tenant_id: TENANT, is_active: true, max_uses: null };
    mockGetReferralCodeByTenant.mockResolvedValueOnce(fake);
    const result = await repo.getReferralCodeByTenant(TENANT);
    expect(result).toBe(fake);
    expect(mockGetReferralCodeByTenant).toHaveBeenCalledWith(TENANT);
  });

  it('getReferralCodeByCode delegates to crud', async () => {
    mockGetReferralCodeByCode.mockResolvedValueOnce(null);
    const result = await repo.getReferralCodeByCode(CODE);
    expect(result).toBeNull();
    expect(mockGetReferralCodeByCode).toHaveBeenCalledWith(CODE);
  });

  it('isReferralCodeValid delegates to crud', async () => {
    mockIsReferralCodeValid.mockResolvedValueOnce(true);
    const result = await repo.isReferralCodeValid(CODE);
    expect(result).toBe(true);
    expect(mockIsReferralCodeValid).toHaveBeenCalledWith(CODE);
  });

  it('incrementUsedCount delegates to crud', async () => {
    mockIncrementUsedCount.mockResolvedValueOnce(undefined);
    await repo.incrementUsedCount(CODE);
    expect(mockIncrementUsedCount).toHaveBeenCalledWith(CODE);
  });

  // ── Tracking CRUD ─────────────────────────────────
  it('trackClick delegates with defaults for metadata/fraud args', async () => {
    mockTrackClick.mockResolvedValueOnce(TRACKING_ID);
    const result = await repo.trackClick(CODE, '1.2.3.4', 'ua');
    expect(result).toBe(TRACKING_ID);
    expect(mockTrackClick).toHaveBeenCalledWith(CODE, '1.2.3.4', 'ua', {}, 0, false);
  });

  it('trackClick forwards all optional args', async () => {
    await repo.trackClick(CODE, '1.2.3.4', 'ua', { src: 'ad' }, 0.8, true);
    expect(mockTrackClick).toHaveBeenCalledWith(CODE, '1.2.3.4', 'ua', { src: 'ad' }, 0.8, true);
  });

  it('markConversion delegates to crud', async () => {
    mockMarkConversion.mockResolvedValueOnce(undefined);
    await repo.markConversion(TRACKING_ID, TENANT, 'user-1');
    expect(mockMarkConversion).toHaveBeenCalledWith(TRACKING_ID, TENANT, 'user-1');
  });

  it('getTrackingById delegates to crud', async () => {
    const fake = { id: TRACKING_ID, referral_code: CODE };
    mockGetTrackingById.mockResolvedValueOnce(fake);
    const result = await repo.getTrackingById(TRACKING_ID);
    expect(result).toBe(fake);
    expect(mockGetTrackingById).toHaveBeenCalledWith(TRACKING_ID);
  });

  it('updateTrackingRevenue delegates to crud', async () => {
    mockUpdateTrackingRevenue.mockResolvedValueOnce(undefined);
    await repo.updateTrackingRevenue(TRACKING_ID, 100, 5);
    expect(mockUpdateTrackingRevenue).toHaveBeenCalledWith(TRACKING_ID, 100, 5);
  });

  // ── Commission CRUD ───────────────────────────────
  it('createCommission delegates with status default', async () => {
    mockCreateCommission.mockResolvedValueOnce(COMMISSION_ID);
    const result = await repo.createCommission(TENANT, TRACKING_ID, 100, 10, new Date('2026-01-01'), new Date('2026-02-01'));
    expect(result).toBe(COMMISSION_ID);
    expect(mockCreateCommission).toHaveBeenCalledWith(TENANT, TRACKING_ID, 100, 10, expect.any(Date), expect.any(Date), 'pending');
  });

  it('createCommission forwards custom status', async () => {
    await repo.createCommission(TENANT, TRACKING_ID, 100, 10, new Date(), new Date(), 'paid');
    expect(mockCreateCommission).toHaveBeenCalledWith(TENANT, TRACKING_ID, 100, 10, expect.any(Date), expect.any(Date), 'paid');
  });

  it('updateCommissionStatus delegates with undefined stripePayoutId', async () => {
    mockUpdateCommissionStatus.mockResolvedValueOnce(undefined);
    await repo.updateCommissionStatus(COMMISSION_ID, 'paid');
    expect(mockUpdateCommissionStatus).toHaveBeenCalledWith(COMMISSION_ID, 'paid', undefined);
  });

  it('updateCommissionStatus forwards stripePayoutId', async () => {
    await repo.updateCommissionStatus(COMMISSION_ID, 'failed', 'stripe-123');
    expect(mockUpdateCommissionStatus).toHaveBeenCalledWith(COMMISSION_ID, 'failed', 'stripe-123');
  });

  // ── Analytics ─────────────────────────────────────
  it('getClicksByCode delegates with defaults', async () => {
    mockGetClicksByCode.mockResolvedValueOnce([]);
    const result = await repo.getClicksByCode(CODE);
    expect(result).toEqual([]);
    expect(mockGetClicksByCode).toHaveBeenCalledWith(CODE, 50, 0);
  });

  it('getClicksByCode forwards limit/offset', async () => {
    await repo.getClicksByCode(CODE, 10, 5);
    expect(mockGetClicksByCode).toHaveBeenCalledWith(CODE, 10, 5);
  });

  it('getTrackingByTenant delegates with defaults', async () => {
    mockGetTrackingByTenant.mockResolvedValueOnce([]);
    const result = await repo.getTrackingByTenant(TENANT);
    expect(result).toEqual([]);
    expect(mockGetTrackingByTenant).toHaveBeenCalledWith(TENANT, 50, 0);
  });

  it('getStats delegates to analytics', async () => {
    const fake = { tenant_id: TENANT, total_clicks: 5 };
    mockGetReferralStats.mockResolvedValueOnce(fake);
    const result = await repo.getStats(TENANT);
    expect(result).toBe(fake);
    expect(mockGetReferralStats).toHaveBeenCalledWith(TENANT);
  });

  it('getCommissions delegates with defaults', async () => {
    mockGetCommissions.mockResolvedValueOnce([]);
    const result = await repo.getCommissions(TENANT);
    expect(result).toEqual([]);
    expect(mockGetCommissions).toHaveBeenCalledWith(TENANT, undefined, 50, 0);
  });

  it('getCommissions forwards status/limit/offset', async () => {
    await repo.getCommissions(TENANT, 'pending', 20, 10);
    expect(mockGetCommissions).toHaveBeenCalledWith(TENANT, 'pending', 20, 10);
  });

  it('getPendingCommissions delegates with defaults', async () => {
    mockGetPendingCommissions.mockResolvedValueOnce([]);
    const result = await repo.getPendingCommissions(new Date('2026-01-01'), new Date('2026-02-01'));
    expect(result).toEqual([]);
    expect(mockGetPendingCommissions).toHaveBeenCalledWith(expect.any(Date), expect.any(Date), 10);
  });

  it('getPendingCommissions forwards minAmount', async () => {
    await repo.getPendingCommissions(new Date(), new Date(), 50);
    expect(mockGetPendingCommissions).toHaveBeenCalledWith(expect.any(Date), expect.any(Date), 50);
  });

  // ── Cookie Attribution ────────────────────────────
  it('createCookieMapping delegates to cookie-attribution', async () => {
    mockCreateMapping.mockResolvedValueOnce('map-1');
    const result = await repo.createCookieMapping(CODE, '1.2.3.4');
    expect(result).toBe('map-1');
    expect(mockCreateMapping).toHaveBeenCalledWith(CODE, '1.2.3.4');
  });

  it('getReferralCodeByCookieHash delegates', async () => {
    mockGetReferralCodeByHash.mockResolvedValueOnce(CODE);
    const result = await repo.getReferralCodeByCookieHash('hash-1');
    expect(result).toBe(CODE);
    expect(mockGetReferralCodeByHash).toHaveBeenCalledWith('hash-1');
  });

  it('getTrackingByCookieHash returns null when no code found', async () => {
    mockGetReferralCodeByHash.mockResolvedValueOnce(null);
    const result = await repo.getTrackingByCookieHash('hash-1');
    expect(result).toBeNull();
    expect(mockGetClicksByCode).not.toHaveBeenCalled();
  });

  it('getTrackingByCookieHash returns first click when code found', async () => {
    const click = { id: 'click-1', referral_code: CODE };
    mockGetReferralCodeByHash.mockResolvedValueOnce(CODE);
    mockGetClicksByCode.mockResolvedValueOnce([click]);
    const result = await repo.getTrackingByCookieHash('hash-1');
    expect(result).toBe(click);
    expect(mockGetClicksByCode).toHaveBeenCalledWith(CODE, 1, 0);
  });

  it('getTrackingByCookieHash returns null when clicks empty', async () => {
    mockGetReferralCodeByHash.mockResolvedValueOnce(CODE);
    mockGetClicksByCode.mockResolvedValueOnce([]);
    const result = await repo.getTrackingByCookieHash('hash-1');
    expect(result).toBeNull();
  });

  it('recordAttribution delegates to cookie-attribution', async () => {
    mockRecordAttribution.mockResolvedValueOnce(undefined);
    await repo.recordAttribution('hash-1', TENANT, TRACKING_ID, new Date('2026-01-01'));
    expect(mockRecordAttribution).toHaveBeenCalledWith('hash-1', TENANT, TRACKING_ID, expect.any(Date));
  });
});
