/**
 * AuditRetentionCleanup — Unit Tests
 *
 * Tests the singleton cleanup job that removes expired audit logs.
 * Mocks AuditLogService.getInstance() to isolate behavior.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Hoisted mocks
const { mockAuditService, mockLogger } = vi.hoisted(() => {
  const mockAuditService = {
    getRetentionDays: vi.fn(() => 90),
    cleanupExpiredLogs: vi.fn(async () => ({ removed: 5, cutoffDate: '2026-01-01T00:00:00.000Z' })),
    getExpiredLogIds: vi.fn(async () => ['id1', 'id2', 'id3']),
  };
  return {
    mockAuditService,
    mockLogger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  };
});

vi.mock('../../../../src/platform/audit/audit-log-service', () => ({
  AuditLogService: {
    getInstance: vi.fn(() => mockAuditService),
  },
}));

vi.mock('../../../../src/shared/utils/logger', () => ({
  logger: mockLogger,
}));

describe('AuditRetentionCleanup', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    // Reset singleton by re-importing with fresh module state
    // We need to reset the singleton so getInstance() creates a new instance
    vi.resetModules();
  });

  afterEach(async () => {
    vi.useRealTimers();
    vi.resetModules();

    // Try to stop any running instance
    try {
      const { AuditRetentionCleanup } = await import('../../../../src/desk/jobs/audit-retention-cleanup');
      // Access singleton and stop it
      (AuditRetentionCleanup as any).instance = undefined;
    } catch {
      // ignore cleanup errors
    }
  });

  async function getInstance() {
    const { AuditRetentionCleanup } = await import('../../../../src/desk/jobs/audit-retention-cleanup');
    return AuditRetentionCleanup;
  }

  describe('getInstance', () => {
    it('returns the same instance on multiple calls', async () => {
      const Cls = await getInstance();
      const a = Cls.getInstance();
      const b = Cls.getInstance();
      expect(a).toBe(b);
    });
  });

  describe('start', () => {
    it('starts cleanup job and logs info', async () => {
      const Cls = await getInstance();
      const instance = Cls.getInstance();

      instance.start(1000);

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Starting daily cleanup job'),
      );

      instance.stop();
    });

    it('does not start if already running', async () => {
      const Cls = await getInstance();
      const instance = Cls.getInstance();

      instance.start(1000);
      instance.start(1000); // second call should be no-op

      expect(mockLogger.info).toHaveBeenCalledWith('Audit retention cleanup job already running');

      instance.stop();
    });

    it('runs cleanup immediately on start', async () => {
      mockAuditService.cleanupExpiredLogs.mockResolvedValueOnce({ removed: 3, cutoffDate: '2026-05-01T00:00:00.000Z' });

      const Cls = await getInstance();
      const instance = Cls.getInstance();

      instance.start(60_000);

      // Should run cleanup immediately
      expect(mockAuditService.cleanupExpiredLogs).toHaveBeenCalledTimes(1);

      instance.stop();
    });

    it('runs cleanup on schedule', async () => {
      const Cls = await getInstance();
      const instance = Cls.getInstance();

      instance.start(5000);

      // Clear the immediate call
      mockAuditService.cleanupExpiredLogs.mockClear();

      // Advance timer to trigger scheduled cleanup
      vi.advanceTimersByTime(5000);

      expect(mockAuditService.cleanupExpiredLogs).toHaveBeenCalledTimes(1);

      instance.stop();
    });
  });

  describe('stop', () => {
    it('stops cleanup job and logs info', async () => {
      const Cls = await getInstance();
      const instance = Cls.getInstance();

      instance.start(1000);
      instance.stop();

      expect(mockLogger.info).toHaveBeenCalledWith('[AuditRetentionCleanup] Cleanup job stopped');
    });

    it('does nothing if not running', async () => {
      const Cls = await getInstance();
      const instance = Cls.getInstance();

      // Stop without start should not log or throw
      instance.stop();

      expect(mockLogger.info).not.toHaveBeenCalledWith(
        expect.stringContaining('Cleanup job stopped'),
      );
    });
  });

  describe('runCleanup', () => {
    it('returns cleanup results with retention info', async () => {
      mockAuditService.getRetentionDays.mockReturnValue(90);
      mockAuditService.cleanupExpiredLogs.mockResolvedValueOnce({
        removed: 10,
        cutoffDate: '2026-06-01T00:00:00.000Z',
      });

      const Cls = await getInstance();
      const instance = Cls.getInstance();

      const result = await instance.runCleanup();

      expect(result).toEqual(expect.objectContaining({
        removed: 10,
        cutoffDate: '2026-06-01T00:00:00.000Z',
        retentionDays: 90,
        timestamp: expect.any(String),
      }));
    });

    it('logs cleanup start and completion', async () => {
      const Cls = await getInstance();
      const instance = Cls.getInstance();

      await instance.runCleanup();

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Running cleanup'),
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Cleanup complete'),
      );
    });

    it('throws and logs error when cleanup fails', async () => {
      mockAuditService.cleanupExpiredLogs.mockRejectedValueOnce(new Error('db connection lost'));

      const Cls = await getInstance();
      const instance = Cls.getInstance();

      await expect(instance.runCleanup()).rejects.toThrow('db connection lost');

      expect(mockLogger.error).toHaveBeenCalledWith(
        '[AuditRetentionCleanup] Cleanup failed:',
        expect.any(Error),
      );
    });
  });

  describe('getCleanupPreview', () => {
    it('returns expired count without running cleanup', async () => {
      mockAuditService.getRetentionDays.mockReturnValue(30);
      mockAuditService.getExpiredLogIds.mockResolvedValueOnce(['a', 'b']);

      const Cls = await getInstance();
      const instance = Cls.getInstance();

      const result = await instance.getCleanupPreview();

      expect(result.expiredCount).toBe(2);
      expect(result.retentionDays).toBe(30);
      expect(result.cutoffDate).toEqual(expect.any(String));
    });

    it('returns zero expired count when no expired logs', async () => {
      mockAuditService.getExpiredLogIds.mockResolvedValueOnce([]);

      const Cls = await getInstance();
      const instance = Cls.getInstance();

      const result = await instance.getCleanupPreview();

      expect(result.expiredCount).toBe(0);
    });
  });
});
