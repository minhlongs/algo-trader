/**
 * Tests for ReferralService — registration, click tracking, conversion,
 * commission processing, monthly payouts, fraud detection batch, plus the
 * private code generation / validation helpers.
 *
 * Dependencies (repository, commissionCalculator, fraudDetector, logger) are
 * mocked so every branch of the service is exercised in isolation.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockLogger, mockRepo, mockCalc, mockFraud } = vi.hoisted(() => ({
  mockLogger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  mockRepo: {
    createReferralCode: vi.fn(),
    getReferralCodeByTenant: vi.fn(),
    getReferralCodeByCode: vi.fn(),
    isReferralCodeValid: vi.fn(),
    trackClick: vi.fn(),
    getTrackingById: vi.fn(),
    markConversion: vi.fn(),
    getStats: vi.fn(),
    getCommissions: vi.fn(),
    createCommission: vi.fn(),
    updateTrackingRevenue: vi.fn(),
    getPendingCommissions: vi.fn(),
    updateCommissionStatus: vi.fn(),
    getClicksByCode: vi.fn(),
    getTrackingByTenant: vi.fn(),
    incrementUsedCount: vi.fn(),
  },
  mockCalc: {
    calculateCommission: vi.fn(),
    calculateCommissionWithRate: vi.fn(),
    getPreviousMonthPeriod: vi.fn(),
  },
  mockFraud: {
    detectFraud: vi.fn(),
    batchAnalyzeClicks: vi.fn(),
  },
}));

vi.mock('../../../shared/utils/logger', () => ({ logger: mockLogger }));
vi.mock('../referral-repository', () => ({ referralRepository: mockRepo }));
vi.mock('../commission-calculator', () => ({ commissionCalculator: mockCalc }));
const { MockFraudDetector } = vi.hoisted(() => ({
  MockFraudDetector: class {
    detectFraud = mockFraud.detectFraud;
    batchAnalyzeClicks = mockFraud.batchAnalyzeClicks;
  },
}));
vi.mock('../fraud-detector', () => ({
  fraudDetector: mockFraud,
  FraudDetector: MockFraudDetector,
}));

import { ReferralService } from '../referral-service';
import type { ReferralCode, ReferralClick } from '../types';

function code(overrides: Partial<ReferralCode> = {}): ReferralCode {
  return {
    code: 'ABCD1234',
    tenantId: 'tenant-1',
    createdAt: new Date('2026-01-01'),
    isActive: true,
    maxUses: null,
    usedCount: 0,
    ...overrides,
  };
}

function click(overrides: Partial<ReferralClick> = {}): ReferralClick {
  return {
    id: 'click-1',
    code: 'ABCD1234',
    ip: '203.0.113.1',
    userAgent: 'Mozilla/5.0',
    clickedAt: new Date('2026-01-02'),
    metadata: {},
    fraudScore: 0,
    isFraudulent: false,
    convertedAt: null,
    convertedTenantId: null,
    convertedUserId: null,
    revenueGenerated: 0,
    commissionCalculated: 0,
    ...overrides,
  };
}

describe('ReferralService', () => {
  let svc: ReferralService;

  beforeEach(() => {
    vi.clearAllMocks();
    svc = new ReferralService();
    // Stub private helpers via prototype so we don't rely on Math.random / regex behavior.
    // @ts-expect-error - override private method for deterministic tests
    svc.generateUniqueCode = vi.fn(() => 'ABCD1234');
  });

  // ── registerReferralCode ───────────────────────────────────────────────────

  it('registers a custom code when provided and valid', async () => {
    mockRepo.getReferralCodeByTenant.mockResolvedValue(code());
    const result = await svc.registerReferralCode('tenant-1', 'ABCD1234');
    expect(mockRepo.createReferralCode).toHaveBeenCalledWith('ABCD1234', 'tenant-1', true, undefined);
    expect(result.code).toBe('ABCD1234');
  });

  it('generates a code when none is supplied', async () => {
    mockRepo.getReferralCodeByTenant.mockResolvedValue(code());
    await svc.registerReferralCode('tenant-1');
    expect(mockRepo.createReferralCode).toHaveBeenCalledWith('ABCD1234', 'tenant-1', true, undefined);
  });

  it('passes maxUses through to the repository', async () => {
    mockRepo.getReferralCodeByTenant.mockResolvedValue(code({ maxUses: 5 }));
    await svc.registerReferralCode('tenant-1', 'ABCD1234', 5);
    expect(mockRepo.createReferralCode).toHaveBeenCalledWith('ABCD1234', 'tenant-1', true, 5);
  });

  it('throws when the custom code fails format validation', async () => {
    await expect(svc.registerReferralCode('tenant-1', 'bad!')).rejects.toThrow(/Invalid referral code format/);
    expect(mockRepo.createReferralCode).not.toHaveBeenCalled();
  });

  it('throws when the repository fails to return the created code', async () => {
    mockRepo.getReferralCodeByTenant.mockResolvedValue(null);
    await expect(svc.registerReferralCode('tenant-1', 'ABCD1234')).rejects.toThrow(/Failed to create referral code/);
  });

  // ── trackReferralClick ─────────────────────────────────────────────────────

  it('tracks a valid click and returns the record', async () => {
    mockRepo.isReferralCodeValid.mockResolvedValue(true);
    mockRepo.trackClick.mockResolvedValue('click-1');
    mockRepo.getTrackingById.mockResolvedValue(click());
    mockFraud.detectFraud.mockResolvedValue({ score: 0, reasons: [], isBlocked: false });
    const result = await svc.trackReferralClick('ABCD1234', '203.0.113.1', 'Mozilla/5.0', { source: 'x' });
    expect(mockRepo.isReferralCodeValid).toHaveBeenCalledWith('ABCD1234');
    expect(mockRepo.trackClick).toHaveBeenCalledWith('ABCD1234', '203.0.113.1', 'Mozilla/5.0', { source: 'x' });
    expect(result.id).toBe('click-1');
    expect(mockFraud.detectFraud).toHaveBeenCalledWith('click-1', '203.0.113.1', 'Mozilla/5.0');
  });

  it('throws when the code is invalid or inactive', async () => {
    mockRepo.isReferralCodeValid.mockResolvedValue(false);
    await expect(svc.trackReferralClick('BAD', '1.1.1.1', 'ua')).rejects.toThrow(/Invalid or inactive referral code/);
    expect(mockRepo.trackClick).not.toHaveBeenCalled();
  });

  it('throws when tracking record cannot be retrieved', async () => {
    mockRepo.isReferralCodeValid.mockResolvedValue(true);
    mockRepo.trackClick.mockResolvedValue('click-1');
    mockRepo.getTrackingById.mockResolvedValue(null);
    await expect(svc.trackReferralClick('ABCD1234', '1.1.1.1', 'ua')).rejects.toThrow(/Failed to retrieve tracking record/);
  });

  it('logs fraud analysis results asynchronously', async () => {
    mockRepo.isReferralCodeValid.mockResolvedValue(true);
    mockRepo.trackClick.mockResolvedValue('click-1');
    mockRepo.getTrackingById.mockResolvedValue(click());
    mockFraud.detectFraud.mockResolvedValue({ score: 80, reasons: ['suspicious'], isBlocked: true });
    await svc.trackReferralClick('ABCD1234', '1.1.1.1', 'ua');
    // The fraud call is fire-and-forget — wait a tick for the .then handler.
    await new Promise(r => setTimeout(r, 0));
    expect(mockLogger.info).toHaveBeenCalledWith('[Referral] Fraud analysis complete', {
      trackingId: 'click-1',
      score: 80,
      isBlocked: true,
      reasons: ['suspicious'],
    });
  });

  // ── recordConversion ───────────────────────────────────────────────────────

  it('marks conversion and logs it', async () => {
    mockRepo.getTrackingById.mockResolvedValue(click({ code: 'ABCD1234' }));
    await svc.recordConversion('click-1', 'tenant-2', 'user-2');
    expect(mockRepo.markConversion).toHaveBeenCalledWith('click-1', 'tenant-2', 'user-2');
    expect(mockLogger.info).toHaveBeenCalledWith('[Referral] Conversion recorded', {
      trackingId: 'click-1',
      convertedTenantId: 'tenant-2',
      referredBy: 'ABCD1234',
    });
  });

  it('throws when the tracking record is missing at conversion time', async () => {
    mockRepo.getTrackingById.mockResolvedValue(null);
    await expect(svc.recordConversion('ghost', 't', 'u')).rejects.toThrow(/Tracking record not found/);
  });

  // ── getReferralStats / getCommissions ──────────────────────────────────────

  it('delegates getReferralStats to the repository', async () => {
    mockRepo.getStats.mockResolvedValue({ clicks: 5, conversions: 1 });
    const stats = await svc.getReferralStats('tenant-1');
    expect(mockRepo.getStats).toHaveBeenCalledWith('tenant-1');
    expect(stats).toEqual({ clicks: 5, conversions: 1 });
  });

  it('returns null stats when the repository has none', async () => {
    mockRepo.getStats.mockResolvedValue(null);
    expect(await svc.getReferralStats('ghost')).toBeNull();
  });

  it('delegates getCommissions with default paging', async () => {
    mockRepo.getCommissions.mockResolvedValue({ commissions: [], total: 0 });
    await svc.getCommissions('tenant-1');
    expect(mockRepo.getCommissions).toHaveBeenCalledWith('tenant-1', undefined, 50, 0);
  });

  it('passes status filter and paging through', async () => {
    mockRepo.getCommissions.mockResolvedValue({ commissions: [], total: 0 });
    await svc.getCommissions('tenant-1', 'pending', 10, 20);
    expect(mockRepo.getCommissions).toHaveBeenCalledWith('tenant-1', 'pending', 10, 20);
  });

  // ── processCommission ──────────────────────────────────────────────────────

  it('processes a commission for a converted tracking record', async () => {
    mockRepo.getTrackingById.mockResolvedValue(click({
      code: 'ABCD1234',
      convertedTenantId: 'tenant-2',
    }));
    mockCalc.calculateCommission.mockReturnValue(25);
    mockCalc.getPreviousMonthPeriod.mockReturnValue({ start: new Date('2026-01-01'), end: new Date('2026-01-31') });
    mockCalc.calculateCommissionWithRate.mockReturnValue(10);
    mockRepo.getReferralCodeByCode.mockResolvedValue(code());
    mockRepo.createCommission.mockResolvedValue('comm-1');
    mockRepo.getCommissions.mockResolvedValue({
      commissions: [{ id: 'comm-1', amount: 25 }],
      total: 1,
    });
    const result = await svc.processCommission('click-1', 250);
    expect(mockCalc.calculateCommission).toHaveBeenCalledWith(250);
    expect(mockRepo.createCommission).toHaveBeenCalledWith(
      'tenant-1', 'click-1', 25, 10,
      new Date('2026-01-01'), new Date('2026-01-31'), 'pending',
    );
    expect(mockRepo.updateTrackingRevenue).toHaveBeenCalledWith('click-1', 250, 25);
    expect(result).toEqual({ id: 'comm-1', amount: 25 });
    expect(mockLogger.info).toHaveBeenCalledWith('[Referral] Commission processed', expect.objectContaining({ commissionId: 'comm-1', amount: 25 }));
  });

  it('throws when no tracking record exists for the commission', async () => {
    mockRepo.getTrackingById.mockResolvedValue(null);
    await expect(svc.processCommission('ghost', 100)).rejects.toThrow(/Tracking record not found/);
  });

  it('throws when the tracking record has no conversion', async () => {
    mockRepo.getTrackingById.mockResolvedValue(click({ convertedTenantId: null }));
    await expect(svc.processCommission('click-1', 100)).rejects.toThrow(/No conversion recorded/);
  });

  it('throws when the referral code cannot be resolved from the tracking code', async () => {
    mockRepo.getTrackingById.mockResolvedValue(click({ convertedTenantId: 't2' }));
    mockCalc.calculateCommission.mockReturnValue(10);
    mockCalc.getPreviousMonthPeriod.mockReturnValue({ start: new Date(), end: new Date() });
    mockRepo.getReferralCodeByCode.mockResolvedValue(null);
    await expect(svc.processCommission('click-1', 100)).rejects.toThrow(/Referral code not found/);
  });

  it('throws when the created commission cannot be retrieved', async () => {
    mockRepo.getTrackingById.mockResolvedValue(click({ convertedTenantId: 't2' }));
    mockCalc.calculateCommission.mockReturnValue(10);
    mockCalc.getPreviousMonthPeriod.mockReturnValue({ start: new Date(), end: new Date() });
    mockRepo.getReferralCodeByCode.mockResolvedValue(code());
    mockRepo.createCommission.mockResolvedValue('comm-1');
    mockRepo.getCommissions.mockResolvedValue({ commissions: [], total: 0 });
    await expect(svc.processCommission('click-1', 100)).rejects.toThrow(/Commission record not found after creation/);
  });

  // ── runMonthlyPayout ───────────────────────────────────────────────────────

  it('approves pending commissions and returns the summary', async () => {
    mockCalc.getPreviousMonthPeriod.mockReturnValue({ start: new Date('2026-01-01'), end: new Date('2026-01-31') });
    mockRepo.getPendingCommissions.mockResolvedValue([
      { tenantId: 't1', amount: 100, commissions: ['c1', 'c2'] },
      { tenantId: 't2', amount: 50, commissions: ['c3'] },
    ]);
    const result = await svc.runMonthlyPayout();
    expect(mockRepo.getPendingCommissions).toHaveBeenCalledWith(expect.any(Date), expect.any(Date), 10);
    expect(mockRepo.updateCommissionStatus).toHaveBeenCalledTimes(3);
    expect(mockRepo.updateCommissionStatus).toHaveBeenCalledWith('c1', 'approved');
    expect(mockRepo.updateCommissionStatus).toHaveBeenCalledWith('c3', 'approved');
    expect(result.processed).toBe(3);
    expect(result.totalAmount).toBe(150);
    expect(result.errors).toEqual([]);
    expect(mockLogger.info).toHaveBeenCalledWith('[Referral] Starting monthly payout job');
  });

  it('collects errors for failing payouts without aborting the batch', async () => {
    mockCalc.getPreviousMonthPeriod.mockReturnValue({ start: new Date(), end: new Date() });
    mockRepo.getPendingCommissions.mockResolvedValue([
      { tenantId: 't1', amount: 100, commissions: ['c1'] },
    ]);
    mockRepo.updateCommissionStatus.mockRejectedValue(new Error('stripe down'));
    const result = await svc.runMonthlyPayout();
    expect(result.processed).toBe(0);
    expect(result.errors).toEqual([{ tenantId: 't1', error: 'stripe down' }]);
    expect(mockLogger.error).toHaveBeenCalledWith('[Referral] Payout failed', expect.objectContaining({ tenantId: 't1' }));
  });

  it('rethrows when fetching pending commissions itself fails', async () => {
    mockCalc.getPreviousMonthPeriod.mockReturnValue({ start: new Date(), end: new Date() });
    mockRepo.getPendingCommissions.mockRejectedValue(new Error('db down'));
    await expect(svc.runMonthlyPayout()).rejects.toThrow(/db down/);
    expect(mockLogger.error).toHaveBeenCalledWith('[Referral] Monthly payout job failed', expect.anything());
  });

  // ── delegation helpers ─────────────────────────────────────────────────────

  it('getReferralCodeByCode delegates to the repository', async () => {
    mockRepo.getReferralCodeByCode.mockResolvedValue(code());
    await svc.getReferralCodeByCode('ABCD1234');
    expect(mockRepo.getReferralCodeByCode).toHaveBeenCalledWith('ABCD1234');
  });

  it('getClicks delegates with defaults', async () => {
    mockRepo.getClicksByCode.mockResolvedValue([]);
    await svc.getClicks('ABCD1234');
    expect(mockRepo.getClicksByCode).toHaveBeenCalledWith('ABCD1234', 50, 0);
  });

  it('getReferralCode (by tenant) delegates', async () => {
    mockRepo.getReferralCodeByTenant.mockResolvedValue(code());
    await svc.getReferralCode('tenant-1');
    expect(mockRepo.getReferralCodeByTenant).toHaveBeenCalledWith('tenant-1');
  });

  it('getTracking delegates with paging', async () => {
    mockRepo.getTrackingByTenant.mockResolvedValue([]);
    await svc.getTracking('tenant-1', 25, 50);
    expect(mockRepo.getTrackingByTenant).toHaveBeenCalledWith('tenant-1', 25, 50);
  });

  // ── runFraudDetection ──────────────────────────────────────────────────────

  it('delegates fraud batch analysis to the detector', async () => {
    mockFraud.batchAnalyzeClicks.mockResolvedValue({ analyzed: 10, flagged: 2, averageScore: 30 });
    const result = await svc.runFraudDetection(500);
    expect(mockFraud.batchAnalyzeClicks).toHaveBeenCalledWith(500);
    expect(result).toEqual({ analyzed: 10, flagged: 2, averageScore: 30 });
  });

  it('uses the default limit when none is provided', async () => {
    mockFraud.batchAnalyzeClicks.mockResolvedValue({ analyzed: 0, flagged: 0, averageScore: 0 });
    await svc.runFraudDetection();
    expect(mockFraud.batchAnalyzeClicks).toHaveBeenCalledWith(1000);
  });

  // ── private helpers (reached via prototype) ────────────────────────────────

  it('isValidCodeFormat accepts an 8-char uppercase alphanumeric code', () => {
    // @ts-expect-error - call private method for test
    expect(svc.isValidCodeFormat('ABCD1234')).toBe(true);
  });

  it('isValidCodeFormat rejects codes that are too short or have symbols', () => {
    // @ts-expect-error - call private method for test
    expect(svc.isValidCodeFormat('ABC123')).toBe(false);
    // @ts-expect-error - call private method for test
    expect(svc.isValidCodeFormat('ABCD-123')).toBe(false);
    // @ts-expect-error - call private method for test
    expect(svc.isValidCodeFormat('abcd1234')).toBe(false);
  });

  it('generateUniqueCode produces an 8-char alphanumeric string', () => {
    // Restore the real implementation for this one test.
    // @ts-expect-error - restore private method
    delete svc.generateUniqueCode;
    // @ts-expect-error - call private method for test
    const c = svc.generateUniqueCode();
    expect(c).toHaveLength(8);
    expect(c).toMatch(/^[A-Z0-9]{8}$/);
  });
});
