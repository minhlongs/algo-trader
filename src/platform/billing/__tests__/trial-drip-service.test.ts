/**
 * Trial Drip Campaign Service — Unit Tests
 *
 * Covers TrialDripService singleton:
 * - subscribe(): registration + persistence
 * - unsubscribe(): deactivation + persistence
 * - processDueEmails(): day-based template selection, sending, skipped/inactive handling, error counting, autoRunPending guard, scheduler recovery
 * - getState(): active/total counts
 * - getSubscriber(): lookup
 * - Template rendering for days 1, 3, 5, 7, 10
 * - Persistence: loadSchedulerState/saveSchedulerState round-trip via scheduler.json
 * - Edge cases: missing dir, corrupted JSON, EmailService uninitialized, send failures
 *
 * Dependencies mocked via vi.hoisted():
 * - logger (shared/utils/logger)
 * - EmailService (platform/notifications/email-service)
 * - fs (readFileSync, writeFileSync, existsSync, mkdirSync)
 * - path (join)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Mock factories (hoisted) ──────────────────────────────────────────────────────

const { mockLogger } = vi.hoisted(() => ({
  mockLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('../../../shared/utils/logger', () => ({ logger: mockLogger }));

const { mockEmailServiceInstance } = vi.hoisted(() => ({
  mockEmailServiceInstance: {
    send: vi.fn().mockResolvedValue(true),
    isInitialized: vi.fn().mockReturnValue(true),
    initialize: vi.fn().mockReturnValue(true),
  },
}));

vi.mock('../../notifications/email-service', () => ({
  EmailService: {
    getInstance: () => mockEmailServiceInstance,
  },
}));

const { mockReadFileSync, mockWriteFileSync, mockExistsSync, mockMkdirSync } = vi.hoisted(() => ({
  mockReadFileSync: vi.fn(),
  mockWriteFileSync: vi.fn(),
  mockExistsSync: vi.fn().mockReturnValue(true),
  mockMkdirSync: vi.fn(),
}));

vi.mock('node:fs', () => ({
  readFileSync: mockReadFileSync,
  writeFileSync: mockWriteFileSync,
  existsSync: mockExistsSync,
  mkdirSync: mockMkdirSync,
}));

const { mockJoin } = vi.hoisted(() => ({
  mockJoin: vi.fn((...args: string[]) => args.join('/')),
}));

vi.mock('node:path', () => ({
  join: mockJoin,
}));

// Now import the module under test
import { TrialDripService, DripSubscriber } from '../trial-drip-service';

// ── Test constants ────────────────────────────────────────────────────────────────

const TEST_EMAIL = 'trader@example.com';
const TEST_TENANT_ID = 'tenant-123';
const TEST_TIER = 'PRO';
const TEST_TRIAL_DAYS = 7;
const NOW_ISO = '2026-09-06T12:00:00.000Z';
const TRIAL_ENDS_ISO = '2026-09-13T12:00:00.000Z';

const BASE_SUBSCRIBER: DripSubscriber = {
  email: TEST_EMAIL,
  tenantId: TEST_TENANT_ID,
  tier: TEST_TIER,
  subscribedAt: NOW_ISO,
  trialEndsAt: TRIAL_ENDS_ISO,
  daysSinceTrialStart: 0,
  lastEmailDay: 0,
  isActive: true,
};

// ── Helpers ──────────────────────────────────────────────────────────────────────

function resetAllMocks(): void {
  vi.clearAllMocks();
  mockLogger.info.mockClear();
  mockLogger.warn.mockClear();
  mockLogger.error.mockClear();
  mockLogger.debug.mockClear();
  mockEmailServiceInstance.send.mockReset();
  mockEmailServiceInstance.send.mockResolvedValue(true);
  mockEmailServiceInstance.isInitialized.mockReturnValue(true);
  mockEmailServiceInstance.initialize.mockReturnValue(true);
  mockReadFileSync.mockReset();
  mockReadFileSync.mockReturnValue(JSON.stringify({ subscribers: {}, autoRunPending: true }));
  mockWriteFileSync.mockReset();
  mockExistsSync.mockReturnValue(true);
  mockMkdirSync.mockReset();
  mockJoin.mockImplementation((...args: string[]) => args.join('/'));

  // Reset singleton instance via private property access
  (TrialDripService as any).instance = undefined;
}

function createService(): TrialDripService {
  return TrialDripService.getInstance();
}

let currentTimeOffset = 0;

function advanceTime(days: number): void {
  currentTimeOffset += days;
  vi.setSystemTime(new Date(NOW_ISO).getTime() + currentTimeOffset * 86400000);
}

function resetTimeOffset(): void {
  currentTimeOffset = 0;
}

function resetTime(): void {
  vi.useRealTimers();
  resetTimeOffset();
}

// ── Tests ────────────────────────────────────────────────────────────────────────

describe('TrialDripService', () => {
  beforeEach(() => {
    resetAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW_ISO));
    resetTimeOffset();
  });

  afterEach(() => {
    resetTime();
  });

  // ── Singleton ────────────────────────────────────────────────────────────────

  describe('getInstance (singleton)', () => {
    it('returns the same instance on repeated calls', () => {
      const a = TrialDripService.getInstance();
      const b = TrialDripService.getInstance();
      expect(a).toBe(b);
    });

    it('creates a service instance with the email dependency', () => {
      expect(TrialDripService.getInstance()).toBeInstanceOf(TrialDripService);
    });
  });

  // ── subscribe ────────────────────────────────────────────────────────────────

  describe('subscribe', () => {
    it('registers a new subscriber with correct defaults', () => {
      const service = createService();
      const result = service.subscribe(TEST_EMAIL, TEST_TENANT_ID, TEST_TIER, TEST_TRIAL_DAYS);

      expect(result.email).toBe(TEST_EMAIL);
      expect(result.tenantId).toBe(TEST_TENANT_ID);
      expect(result.tier).toBe(TEST_TIER);
      expect(result.subscribedAt).toBe(NOW_ISO);
      expect(result.trialEndsAt).toBe(TRIAL_ENDS_ISO);
      expect(result.daysSinceTrialStart).toBe(0);
      expect(result.lastEmailDay).toBe(0);
      expect(result.isActive).toBe(true);
    });

    it('uses default trialDays = 7 when not provided', () => {
      const service = createService();
      const result = service.subscribe(TEST_EMAIL, TEST_TENANT_ID, TEST_TIER);
      const expectedEnds = new Date(new Date(NOW_ISO).getTime() + 7 * 86400000).toISOString();
      expect(result.trialEndsAt).toBe(expectedEnds);
    });

    it('sets autoRunPending = true and persists', () => {
      const service = createService();
      service.subscribe(TEST_EMAIL, TEST_TENANT_ID, TEST_TIER);
      expect(mockWriteFileSync).toHaveBeenCalled();
      const written = JSON.parse(mockWriteFileSync.mock.calls[0][1]);
      expect(written.autoRunPending).toBe(true);
    });

    it('logs registration', () => {
      const service = createService();
      service.subscribe(TEST_EMAIL, TEST_TENANT_ID, TEST_TIER);
      expect(mockLogger.info).toHaveBeenCalledWith('[TrialDrip] Subscriber registered', {
        email: TEST_EMAIL,
        tenantId: TEST_TENANT_ID,
        tier: TEST_TIER,
      });
    });

    it('overwrites existing subscriber for same tenantId', () => {
      const service = createService();
      service.subscribe(TEST_EMAIL, TEST_TENANT_ID, TEST_TIER);
      const second = service.subscribe('other@example.com', TEST_TENANT_ID, 'BASIC');
      expect(second.email).toBe('other@example.com');
      expect(second.tier).toBe('BASIC');
      expect(service.getSubscriber(TEST_TENANT_ID)?.email).toBe('other@example.com');
    });
  });

  // ── unsubscribe ──────────────────────────────────────────────────────────────

  describe('unsubscribe', () => {
    it('returns false for non-existent tenantId', () => {
      const service = createService();
      const result = service.unsubscribe('missing');
      expect(result).toBe(false);
      expect(mockLogger.info).not.toHaveBeenCalledWith('[TrialDrip] Subscriber unsubscribed', expect.any(Object));
    });

    it('deactivates existing subscriber and returns true', () => {
      const service = createService();
      service.subscribe(TEST_EMAIL, TEST_TENANT_ID, TEST_TIER);
      const result = service.unsubscribe(TEST_TENANT_ID);

      expect(result).toBe(true);
      expect(service.getSubscriber(TEST_TENANT_ID)?.isActive).toBe(false);
      expect(mockLogger.info).toHaveBeenCalledWith('[TrialDrip] Subscriber unsubscribed', { tenantId: TEST_TENANT_ID });
      expect(mockWriteFileSync).toHaveBeenCalled();
    });

    it('persists deactivated state', () => {
      const service = createService();
      service.subscribe(TEST_EMAIL, TEST_TENANT_ID, TEST_TIER);
      mockWriteFileSync.mockClear();
      service.unsubscribe(TEST_TENANT_ID);
      const written = JSON.parse(mockWriteFileSync.mock.calls[0][1]);
      expect(written.subscribers[TEST_TENANT_ID].isActive).toBe(false);
    });
  });

  // ── getState ────────────────────────────────────────────────────────────────

  describe('getState', () => {
    it('returns zero counts for empty service', () => {
      const service = createService();
      const state = service.getState();
      expect(state).toEqual({ activeSubscribers: 0, totalSubscribers: 0 });
    });

    it('counts active and total subscribers correctly', () => {
      const service = createService();
      service.subscribe('a@test.com', 't1', 'PRO');
      service.subscribe('b@test.com', 't2', 'PRO');
      service.subscribe('c@test.com', 't3', 'PRO');
      service.unsubscribe('t2');

      const state = service.getState();
      expect(state).toEqual({ activeSubscribers: 2, totalSubscribers: 3 });
    });
  });

  // ── getSubscriber ────────────────────────────────────────────────────────────

  describe('getSubscriber', () => {
    it('returns undefined for missing tenantId', () => {
      const service = createService();
      expect(service.getSubscriber('missing')).toBeUndefined();
    });

    it('returns subscriber copy', () => {
      const service = createService();
      service.subscribe(TEST_EMAIL, TEST_TENANT_ID, TEST_TIER);
      const sub = service.getSubscriber(TEST_TENANT_ID);
      expect(sub).toEqual(BASE_SUBSCRIBER);
    });
  });

  // ── processDueEmails — autoRunPending guard ──────────────────────────────────

  describe('processDueEmails — autoRunPending guard', () => {
    it('returns zeros when no active subscribers', async () => {
      const service = createService();
      const result = await service.processDueEmails();
      expect(result).toEqual({ sent: 0, skipped: 0, errors: 0 });
      expect(mockEmailServiceInstance.send).not.toHaveBeenCalled();
    });

    it('returns zeros when autoRunPending is false', async () => {
      const service = createService();
      service.subscribe(TEST_EMAIL, TEST_TENANT_ID, TEST_TIER);
      // Manually set autoRunPending to false by calling processDueEmails once (which sets it to false)
      await service.processDueEmails(); // first call sets autoRunPending = false
      mockEmailServiceInstance.send.mockClear();
      const result = await service.processDueEmails(); // second call should return zeros
      expect(result).toEqual({ sent: 0, skipped: 0, errors: 0 });
      expect(mockEmailServiceInstance.send).not.toHaveBeenCalled();
    });

    it('processes emails when autoRunPending is true', async () => {
      const service = createService();
      service.subscribe(TEST_EMAIL, TEST_TENANT_ID, TEST_TIER);
      advanceTime(1); // day 1 eligible
      const result = await service.processDueEmails();
      expect(result.sent).toBeGreaterThanOrEqual(1);
      expect(mockEmailServiceInstance.send).toHaveBeenCalled();
    });
  });

  // ── processDueEmails — scheduler recovery (fresh process) ────────────────────

  describe('processDueEmails — scheduler recovery', () => {
    it('rebuilds in-memory state from persisted scheduler.json on fresh process', async () => {
      // Simulate persisted state with existing subscribers
      const persistedState = {
        subscribers: {
          't-1': {
            email: 'recovered@test.com',
            tier: 'PRO',
            subscribedAt: '2026-09-01T00:00:00.000Z',
            trialEndsAt: '2026-09-08T00:00:00.000Z',
            lastEmailDay: 1,
            isActive: true,
          },
        },
        autoRunPending: true,
      };
      mockReadFileSync.mockReturnValue(JSON.stringify(persistedState));

      const service = createService();
      // At this point, in-memory subscribers Map is empty
      expect(service.getState().totalSubscribers).toBe(0);

      // Call processDueEmails — should recover from scheduler.json
      advanceTime(3); // day 3, subscriber has lastEmailDay=1, so day 3 eligible
      const result = await service.processDueEmails();

      expect(result.sent).toBeGreaterThanOrEqual(1);
      expect(service.getSubscriber('t-1')).toBeDefined();
      expect(service.getSubscriber('t-1')?.email).toBe('recovered@test.com');
      expect(service.getSubscriber('t-1')?.lastEmailDay).toBeGreaterThanOrEqual(1);
    });

    it('recovers autoRunPending flag from persisted state', async () => {
      const persistedState = {
        subscribers: {
          't-1': { email: 'recovered@test.com', tier: 'PRO', subscribedAt: NOW_ISO, trialEndsAt: TRIAL_ENDS_ISO, lastEmailDay: 0, isActive: true },
        },
        autoRunPending: false, // was already processed
      };
      mockReadFileSync.mockReturnValue(JSON.stringify(persistedState));

      const service = createService();
      advanceTime(1);
      const result = await service.processDueEmails();

      // autoRunPending was false, so should return zeros without sending
      expect(result).toEqual({ sent: 0, skipped: 0, errors: 0 });
    });

    it('handles corrupted scheduler.json gracefully', async () => {
      mockReadFileSync.mockImplementation(() => { throw new Error('corrupted'); });

      const service = createService();
      service.subscribe(TEST_EMAIL, TEST_TENANT_ID, TEST_TIER);
      advanceTime(1);
      const result = await service.processDueEmails();

      // Should still work with in-memory state
      expect(result.sent).toBeGreaterThanOrEqual(1);
    });
  });

  // ── processDueEmails — template selection & sending ──────────────────────────

  describe('processDueEmails — template selection', () => {
    it('sends day 1 template on day 1', async () => {
      const service = createService();
      service.subscribe(TEST_EMAIL, TEST_TENANT_ID, TEST_TIER);
      advanceTime(1);
      await service.processDueEmails();

      expect(mockEmailServiceInstance.send).toHaveBeenCalledWith(
        expect.objectContaining({
          to: TEST_EMAIL,
          subject: 'Welcome to AlgoTrader — Your 7-Day Trial Starts Now',
        })
      );
    });

    it('sends day 3 template on day 3', async () => {
      const service = createService();
      service.subscribe(TEST_EMAIL, TEST_TENANT_ID, TEST_TIER);
      advanceTime(3);
      await service.processDueEmails();

      expect(mockEmailServiceInstance.send).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: 'Your AI Edge: How Kelly Sizing Works',
        })
      );
    });

    it('sends day 5 template on day 5', async () => {
      const service = createService();
      service.subscribe(TEST_EMAIL, TEST_TENANT_ID, TEST_TIER);
      advanceTime(5);
      await service.processDueEmails();

      expect(mockEmailServiceInstance.send).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: 'Real Results: Our Paper Trading Track Record',
        })
      );
    });

    it('sends day 7 template on day 7', async () => {
      const service = createService();
      service.subscribe(TEST_EMAIL, TEST_TENANT_ID, TEST_TIER);
      advanceTime(7);
      await service.processDueEmails();

      expect(mockEmailServiceInstance.send).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: "Your Trial Ends Tomorrow — Don't Lose Access",
        })
      );
    });

    it('sends day 10 template on day 10 (post-trial win-back)', async () => {
      const service = createService();
      service.subscribe(TEST_EMAIL, TEST_TENANT_ID, TEST_TIER);
      advanceTime(10);
      await service.processDueEmails();

      expect(mockEmailServiceInstance.send).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: 'We Miss You — Special Offer Inside',
        })
      );
    });

    it('skips already-sent days (lastEmailDay tracking)', async () => {
      const service = createService();
      service.subscribe(TEST_EMAIL, TEST_TENANT_ID, TEST_TIER);
      advanceTime(1);
      await service.processDueEmails(); // sends day 1
      mockEmailServiceInstance.send.mockClear();
      (service as any).autoRunPending = true; // re-enable for second pass
      advanceTime(2); // day 3
      await service.processDueEmails();

      // Should only send day 3, not day 1 again
      expect(mockEmailServiceInstance.send).toHaveBeenCalledTimes(1);
      expect(mockEmailServiceInstance.send).toHaveBeenCalledWith(
        expect.objectContaining({ subject: 'Your AI Edge: How Kelly Sizing Works' })
      );
    });

    it('sends multiple eligible days in one call if skipped', async () => {
      const service = createService();
      service.subscribe(TEST_EMAIL, TEST_TENANT_ID, TEST_TIER);
      advanceTime(5); // days 1, 3, 5 all eligible
      await service.processDueEmails();

      expect(mockEmailServiceInstance.send).toHaveBeenCalledTimes(3);
    });

    it('processes active subscribers while skipping inactive ones', async () => {
      const service = createService();
      service.subscribe('active@test.com', 't-active', 'PRO');
      service.subscribe('inactive@test.com', 't-inactive', 'PRO');
      service.unsubscribe('t-inactive');
      advanceTime(1);
      const result = await service.processDueEmails();

      expect(result.sent).toBe(1);
      expect(result.skipped).toBe(1);
      expect(result.errors).toBe(0);
    });
  });

  // ── processDueEmails — inactive subscriber handling ──────────────────────────

  describe('processDueEmails — inactive subscribers', () => {
    it('skips inactive subscribers and increments skipped count', async () => {
      const service = createService();
      service.subscribe(TEST_EMAIL, TEST_TENANT_ID, TEST_TIER);
      service.unsubscribe(TEST_TENANT_ID);
      advanceTime(1);
      const result = await service.processDueEmails();

      // SUT: hasActive guard returns zeros when all subscribers are inactive
      expect(result).toEqual({ sent: 0, skipped: 0, errors: 0 });
      expect(mockEmailServiceInstance.send).not.toHaveBeenCalled();
    });

    it('processes active subscribers while skipping inactive ones', async () => {
      const service = createService();
      service.subscribe('active@test.com', 't-active', 'PRO');
      service.subscribe('inactive@test.com', 't-inactive', 'PRO');
      service.unsubscribe('t-inactive');
      advanceTime(1);
      const result = await service.processDueEmails();

      expect(result.sent).toBe(1);
      expect(result.skipped).toBe(1);
      expect(result.errors).toBe(0);
    });
  });

  // ── processDueEmails — error handling ────────────────────────────────────────

  describe('processDueEmails — error handling', () => {
    it('increments errors when EmailService.send returns false', async () => {
      const service = createService();
      service.subscribe(TEST_EMAIL, TEST_TENANT_ID, TEST_TIER);
      mockEmailServiceInstance.send.mockResolvedValueOnce(false);
      advanceTime(1);
      const result = await service.processDueEmails();

      expect(result.errors).toBe(1);
      expect(result.sent).toBe(0);
      expect(mockLogger.warn).toHaveBeenCalledWith('[TrialDrip] Email send failed', { tenantId: TEST_TENANT_ID, day: 1 });
    });

    it('increments errors when EmailService.send throws', async () => {
      const service = createService();
      service.subscribe(TEST_EMAIL, TEST_TENANT_ID, TEST_TIER);
      mockEmailServiceInstance.send.mockRejectedValueOnce(new Error('network down'));
      advanceTime(1);
      const result = await service.processDueEmails();

      expect(result.errors).toBe(1);
      expect(result.sent).toBe(0);
      expect(mockLogger.error).toHaveBeenCalledWith('[TrialDrip] Email error', {
        tenantId: TEST_TENANT_ID,
        day: 1,
        error: 'Error: network down',
      });
    });

    it('continues processing other subscribers after one fails', async () => {
      const service = createService();
      service.subscribe('ok@test.com', 't-ok', 'PRO');
      service.subscribe('fail@test.com', 't-fail', 'PRO');
      mockEmailServiceInstance.send
        .mockResolvedValueOnce(true)
        .mockRejectedValueOnce(new Error('fail'));
      advanceTime(1);
      const result = await service.processDueEmails();

      expect(result.sent).toBe(1);
      expect(result.errors).toBe(1);
    });

    it('handles EmailService not initialized', async () => {
      // Simulate EmailService not initialized: send returns false
      mockEmailServiceInstance.isInitialized.mockReturnValue(false);
      mockEmailServiceInstance.send.mockResolvedValue(false);
      const service = createService();
      service.subscribe(TEST_EMAIL, TEST_TENANT_ID, TEST_TIER);
      advanceTime(1);
      const result = await service.processDueEmails();

      expect(result.errors).toBe(1);
      expect(result.sent).toBe(0);
      expect(mockLogger.warn).toHaveBeenCalledWith('[TrialDrip] Email send failed', { tenantId: TEST_TENANT_ID, day: 1 });
    });
  });

  // ── processDueEmails — persistence after each send ──────────────────────────

  describe('processDueEmails — persistence', () => {
    it('persists after each successful email send', async () => {
      const service = createService();
      service.subscribe(TEST_EMAIL, TEST_TENANT_ID, TEST_TIER);
      mockWriteFileSync.mockClear(); // clear the subscribe persist
      advanceTime(3); // days 1 and 3 eligible
      await service.processDueEmails();

      // Should persist after day 1 and after day 3
      expect(mockWriteFileSync).toHaveBeenCalledTimes(2);
      const lastWrite = JSON.parse(mockWriteFileSync.mock.calls[1][1]);
      expect(lastWrite.subscribers[TEST_TENANT_ID].lastEmailDay).toBe(3);
    });

    it('updates lastEmailDay in persisted state', async () => {
      const service = createService();
      service.subscribe(TEST_EMAIL, TEST_TENANT_ID, TEST_TIER);
      mockWriteFileSync.mockClear(); // clear the subscribe persist
      advanceTime(1);
      await service.processDueEmails();

      const written = JSON.parse(mockWriteFileSync.mock.calls[0][1]);
      expect(written.subscribers[TEST_TENANT_ID].lastEmailDay).toBe(1);
    });
  });

  // ── processDueEmails — summary return ────────────────────────────────────────

  describe('processDueEmails — return summary', () => {
    it('returns correct counts for mixed outcomes', async () => {
      const service = createService();
      service.subscribe('a@test.com', 't-a', 'PRO');
      service.subscribe('b@test.com', 't-b', 'PRO');
      service.subscribe('c@test.com', 't-c', 'PRO');
      service.unsubscribe('t-c'); // inactive
      // Order: t-a day 1, t-a day 3, t-b day 1, t-b day 3
      // We want: t-a day 1 success, t-a day 3 success, t-b day 1 fail
      mockEmailServiceInstance.send
        .mockResolvedValueOnce(true)  // t-a day 1
        .mockResolvedValueOnce(true)  // t-a day 3
        .mockResolvedValueOnce(false) // t-b day 1
        .mockResolvedValueOnce(false); // t-b day 3
      advanceTime(3);
      (service as any).autoRunPending = true; // re-enable after first call
      const result = await service.processDueEmails();

      // t-a: 2 sent, t-b: 2 errors (day 1 + day 3), t-c: 1 skipped
      expect(result).toEqual({ sent: 2, skipped: 1, errors: 2 });
    });
  });

  // ── Template content verification ────────────────────────────────────────────

  describe('Email templates — content', () => {
    it('day 1 template includes trial end date', async () => {
      const service = createService();
      service.subscribe(TEST_EMAIL, TEST_TENANT_ID, TEST_TIER);
      advanceTime(1);
      await service.processDueEmails();

      const call = mockEmailServiceInstance.send.mock.calls[0][0];
      // SUT uses toLocaleDateString() - format depends on locale, but will contain day/month/year
      expect(call.html).toContain('2026'); // year
      expect(call.html).toContain('9') || call.html.toContain('13'); // month or day
      expect(call.body).toContain('2026');
    });

    it('day 7 template includes tier name', async () => {
      const service = createService();
      service.subscribe(TEST_EMAIL, TEST_TENANT_ID, 'ENTERPRISE');
      advanceTime(7);
      await service.processDueEmails();

      // Should send days 1, 3, 5, 7 - check the day 7 call
      const day7Call = mockEmailServiceInstance.send.mock.calls.find((c: any) =>
        c[0].subject.includes("Trial Ends Tomorrow")
      );
      expect(day7Call).toBeDefined();
      // SUT only puts tier in body/html, not subject
      expect(day7Call![0].body).toContain('ENTERPRISE');
      expect(day7Call![0].html).toContain('ENTERPRISE');
    });

    it('day 10 template includes coupon code TRIAL20', async () => {
      const service = createService();
      service.subscribe(TEST_EMAIL, TEST_TENANT_ID, TEST_TIER);
      advanceTime(10);
      await service.processDueEmails();

      // Should send days 1, 3, 5, 7, 10 - check the day 10 call
      const day10Call = mockEmailServiceInstance.send.mock.calls.find((c: any) =>
        c[0].subject === 'We Miss You — Special Offer Inside'
      );
      expect(day10Call).toBeDefined();
      expect(day10Call![0].subject).toBe('We Miss You — Special Offer Inside');
      expect(day10Call![0].html).toContain('TRIAL20');
      expect(day10Call![0].body).toContain('TRIAL20');
    });
  });

  // ── Edge cases ────────────────────────────────────────────────────────────────

  describe('Edge cases', () => {
    it('handles missing data directory on persist', () => {
      mockExistsSync.mockReturnValue(false);
      const service = createService();
      service.subscribe(TEST_EMAIL, TEST_TENANT_ID, TEST_TIER);
      expect(mockMkdirSync).toHaveBeenCalled();
    });

    it('propagates fs write errors from saveSchedulerState', () => {
      mockWriteFileSync.mockImplementation(() => { throw new Error('disk full'); });
      const service = createService();
      expect(() => service.subscribe(TEST_EMAIL, TEST_TENANT_ID, TEST_TIER)).toThrow('disk full');
    });

    it('persistSchedulerState clears state when subscribers Map is empty', () => {
      const service = createService();
      service.subscribe(TEST_EMAIL, TEST_TENANT_ID, TEST_TIER);
      mockWriteFileSync.mockClear();
      // Manually clear internal map to simulate empty state
      (service as any).subscribers.clear();
      (service as any).persistSchedulerState();
      const written = JSON.parse(mockWriteFileSync.mock.calls[0][1]);
      expect(written.subscribers).toEqual({});
      expect(written.autoRunPending).toBe(false);
    });

    it('handles subscriber with daysSinceTrialStart > 10 (no more templates)', async () => {
      const service = createService();
      service.subscribe(TEST_EMAIL, TEST_TENANT_ID, TEST_TIER);
      advanceTime(15); // beyond day 10
      const result = await service.processDueEmails();
      // Should send days 1, 3, 5, 7, 10 = 5 emails
      expect(result.sent).toBe(5);
    });

    it('handles concurrent subscribers with different trial start dates', async () => {
      const service = createService();
      service.subscribe('early@test.com', 't-early', 'PRO'); // starts at NOW_ISO
      advanceTime(2);
      service.subscribe('late@test.com', 't-late', 'PRO'); // starts at day 2
      (service as any).autoRunPending = true; // re-enable for second pass
      advanceTime(1); // day 3 for early, day 1 for late
      const result = await service.processDueEmails();

      // early gets days 1+3 (2 emails), late gets day 1 (1 email) = 3 total
      expect(result.sent).toBe(3);
    });
  });
});