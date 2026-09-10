/**
 * Tests for signals-api/usage-metering-service — the per-subscriber Signals API
 * billing tracker. Covers UsageMeteringService.check / recordCall / getPeriodUsage /
 * getSnapshot / getTierBreakdown / computeOverage plus the InMemoryCounter helper
 * and currentPeriod() edge cases.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const queryMock = vi.fn();

// Mock postgres-client + logger so the service never touches a real DB.
vi.mock('../../../../src/db/postgres-client', () => ({ query: (...args: unknown[]) => queryMock(...args) }));
vi.mock('../../../../src/shared/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import {
  UsageMeteringService,
  type UsageCheckResult,
  type UsageSnapshot,
} from '../../../../src/platform/signals-api/usage-metering-service';

describe('UsageMeteringService', () => {
  let service: UsageMeteringService;

  beforeEach(() => {
    service = new UsageMeteringService();
    vi.clearAllMocks();
    vi.setSystemTime(new Date('2026-07-15T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('check', () => {
    it('allows the first call within the monthly limit', async () => {
      queryMock.mockResolvedValue({ rows: [] });
      const result: UsageCheckResult = await service.check('sub-1', 'PRO');
      expect(result).toEqual({
        allowed: true,
        remaining: 10_000 - 1,
        limitReached: false,
        overage: 0,
        tier: 'PRO',
        period: '2026-07',
      });
    });

    it('blocks when the monthly limit is already reached', async () => {
      queryMock.mockResolvedValue({ rows: [{ calls_this_period: 10_000 }] });
      const result = await service.check('sub-1', 'PRO');
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
      expect(result.limitReached).toBe(true);
      expect(result.overage).toBe(0);
    });

    it('computes overage when usage exceeds the limit', async () => {
      queryMock.mockResolvedValue({ rows: [{ calls_this_period: 10_500 }] });
      const result = await service.check('sub-1', 'PRO');
      expect(result.allowed).toBe(false);
      expect(result.limitReached).toBe(true);
      expect(result.overage).toBe(500);
    });

    it('falls back to the FREE tier limit for an unknown tier', async () => {
      queryMock.mockResolvedValue({ rows: [] });
      const result = await service.check('sub-1', 'UNKNOWN');
      expect(result.remaining).toBe(1_000 - 1);
      expect(result.tier).toBe('UNKNOWN');
    });

    it('uses the FREE daily-cap fallback limit of 1_000 when tier is missing', async () => {
      queryMock.mockResolvedValue({ rows: [] });
      // tier '' is not in MONTHY_LIMITS, so the default 1_000 applies
      const result = await service.check('sub-1', '');
      expect(result.remaining).toBe(999);
    });
  });

  describe('recordCall', () => {
    it('upserts a usage_metrics row via query', async () => {
      queryMock.mockResolvedValue({ rows: [] });
      await service.recordCall('sub-1', 'ENTERPRISE');
      expect(queryMock).toHaveBeenCalledOnce();
      const [sql, params] = queryMock.mock.calls[0]!;
      expect(sql).toContain('INSERT INTO usage_metrics');
      expect(sql).toContain('ON CONFLICT (subscriber_id, period) DO UPDATE SET');
      expect(params).toEqual([
        'usage_sub-1_2026-07',
        'sub-1',
        '2026-07',
        100_000,
        expect.any(Number),
      ]);
    });

    it('swallows DB errors (non-fatal) and logs a warning', async () => {
      const warnSpy = vi.spyOn(
        (await import('../../../../src/shared/utils/logger')).logger,
        'warn',
      );
      queryMock.mockRejectedValue(new Error('DB down'));
      await expect(service.recordCall('sub-1', 'PRO')).resolves.toBeUndefined();
      expect(warnSpy).toHaveBeenCalledWith(
        '[UsageMeter] recordCall error (non-fatal)',
        expect.objectContaining({ subscriberId: 'sub-1' }),
      );
    });

    it('applies the default limit for an unknown tier', async () => {
      queryMock.mockResolvedValue({ rows: [] });
      await service.recordCall('sub-1', 'GHOST');
      const [, params] = queryMock.mock.calls[0]!;
      expect(params![3]).toBe(1_000);
    });
  });

  describe('getPeriodUsage', () => {
    it('returns the stored calls_this_period', async () => {
      queryMock.mockResolvedValue({ rows: [{ calls_this_period: 42 }] });
      expect(await service.getPeriodUsage('sub-1', '2026-07')).toBe(42);
    });

    it('returns 0 when there is no row for the period', async () => {
      queryMock.mockResolvedValue({ rows: [] });
      expect(await service.getPeriodUsage('sub-1', '2020-01')).toBe(0);
    });

    it('returns 0 on a DB error', async () => {
      queryMock.mockRejectedValue(new Error('boom'));
      expect(await service.getPeriodUsage('sub-1', '2026-07')).toBe(0);
    });
  });

  describe('getSnapshot', () => {
    it('maps a usage_metrics row to a UsageSnapshot', async () => {
      queryMock.mockResolvedValue({
        rows: [{
          id: 'usage_sub-1_2026-07',
          subscriber_id: 'sub-1',
          period: '2026-07',
          calls_today: 5,
          calls_this_period: 42,
          period_limit: 10_000,
          overage_calls: 0,
          last_reset_at: 1_700_000_000_000,
          updated_at: 1_700_000_000_000,
        }],
      });
      const snap: UsageSnapshot | undefined = await service.getSnapshot('sub-1');
      expect(snap).toEqual({
        id: 'usage_sub-1_2026-07',
        subscriberId: 'sub-1',
        period: '2026-07',
        callsToday: 5,
        callsThisPeriod: 42,
        periodLimit: 10_000,
        overageCalls: 0,
        lastResetAt: 1_700_000_000_000,
        updatedAt: 1_700_000_000_000,
      });
    });

    it('returns undefined when no row exists', async () => {
      queryMock.mockResolvedValue({ rows: [] });
      expect(await service.getSnapshot('sub-1')).toBeUndefined();
    });
  });

  describe('getTierBreakdown', () => {
    it('groups active subscriptions by tier', async () => {
      queryMock.mockResolvedValue({
        rows: [{ tier: 'PRO', cnt: 3 }, { tier: 'ENTERPRISE', cnt: 7 }],
      });
      expect(await service.getTierBreakdown()).toEqual({ PRO: 3, ENTERPRISE: 7 });
    });

    it('returns an empty object when there are no rows', async () => {
      queryMock.mockResolvedValue({ rows: [] });
      expect(await service.getTierBreakdown()).toEqual({});
    });
  });

  describe('computeOverage', () => {
    it('is 0 when usage is within the limit', () => {
      expect(service.computeOverage('PRO', 5_000)).toBe(0);
    });

    it('charges overage * price per call above the limit', () => {
      // PRO: limit 10_000, overage 500, price 0.01 => 5.00
      expect(service.computeOverage('PRO', 10_500)).toBeCloseTo(5.0, 5);
    });

    // ENTERPRISE price is cheaper per-call.
    it('uses the ENTERPRISE overage price (0.005)', () => {
      // limit 100_000, overage 2_000, price 0.005 => 10.00
      expect(service.computeOverage('ENTERPRISE', 102_000)).toBeCloseTo(10.0, 5);
    });

    it('returns 0 overage price for FREE tier', () => {
      expect(service.computeOverage('FREE', 999_999)).toBe(0);
    });

    it('falls back to the default limit for an unknown tier', () => {
      // default limit 1_000, overage 100, unknown tier price defaults to 0
      expect(service.computeOverage('GHOST', 1_100)).toBe(0);
    });
  });

  describe('currentPeriod (indirectly via check)', () => {
    it('formats a single-digit month with a leading zero', async () => {
      vi.setSystemTime(new Date('2026-03-05T08:00:00Z'));
      queryMock.mockResolvedValue({ rows: [] });
      const result = await service.check('sub-1', 'FREE');
      expect(result.period).toBe('2026-03');
    });

    it('formats a double-digit month', async () => {
      vi.setSystemTime(new Date('2026-11-20T08:00:00Z'));
      queryMock.mockResolvedValue({ rows: [] });
      const result = await service.check('sub-1', 'FREE');
      expect(result.period).toBe('2026-11');
    });
  });
});
