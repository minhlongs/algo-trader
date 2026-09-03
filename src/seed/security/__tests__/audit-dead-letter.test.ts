/**
 * Audit Dead Letter — unit tests
 * Target: 100% coverage for src/seed/security/audit-dead-letter.ts
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock logger before importing the module
vi.mock('../../../shared/utils/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { logger } from '../../../shared/utils/logger';
import { createDeadLetterHandler } from '../audit-dead-letter';
import type { IAuditEntry } from '../types';

const mockKey = Buffer.from('test-key-0123456789abcdef');
const entry1: IAuditEntry = {
  id: 'entry-1',
  timestamp: '2024-01-01T00:00:00Z',
  actor: 'test-actor',
  action: 'test.action',
  resource: 'TestResource:1',
  result: 'failure',
  metadata: { foo: 'bar' },
  ipHash: 'hashed-ip',
  tenantId: 'tenant-1',
};
const entry2: IAuditEntry = {
  id: 'entry-2',
  timestamp: '2024-01-01T00:01:00Z',
  actor: 'test-actor',
  action: 'test.action2',
  resource: 'TestResource:2',
  result: 'success',
  metadata: { baz: 'qux' },
  ipHash: 'hashed-ip',
};

describe('audit-dead-letter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('createDeadLetterHandler', () => {
    it('returns handler functions', async () => {
      const { createDeadLetterHandler } = await import('../audit-dead-letter');
      const handlers = createDeadLetterHandler(vi.fn(), vi.fn());
      expect(handlers.enqueueDeadLetter).toBeTypeOf('function');
      expect(handlers.flushDeadLetters).toBeTypeOf('function');
      expect(handlers.getDeadLetterStatus).toBeTypeOf('function');
    });
  });

  describe('enqueueDeadLetter', () => {
    it('adds entry to dead letter queue', async () => {
      const { createDeadLetterHandler } = await import('../audit-dead-letter');
      const writeAuditRow = vi.fn();
      const { enqueueDeadLetter } = createDeadLetterHandler(vi.fn(), writeAuditRow);
      const err = new Error('Write failed');
      enqueueDeadLetter(entry1, err);

      expect(logger.warn).toHaveBeenCalledWith(
        '[AuditLog] Write failed — enqueued to dead letter queue',
        expect.objectContaining({
          entryId: 'entry-1',
          tenantId: 'tenant-1',
          error: 'Write failed',
          queueLength: 1,
        }),
      );
    });

    it('logs with undefined tenantId when not provided', async () => {
      const { createDeadLetterHandler } = await import('../audit-dead-letter');
      const writeAuditRow = vi.fn();
      const { enqueueDeadLetter } = createDeadLetterHandler(vi.fn(), writeAuditRow);
      enqueueDeadLetter(entry2, new Error('fail'));
      expect((logger.warn as any).mock.calls[0][1].tenantId).toBeUndefined();
    });
  });

  describe('flushDeadLetters', () => {
    it('returns early when queue is empty', async () => {
      const { createDeadLetterHandler } = await import('../audit-dead-letter');
      const initHmacKey = vi.fn();
      const writeAuditRow = vi.fn();
      const { flushDeadLetters } = createDeadLetterHandler(initHmacKey, writeAuditRow);
      await flushDeadLetters();
      expect(initHmacKey).not.toHaveBeenCalled();
      expect(writeAuditRow).not.toHaveBeenCalled();
    });

    it('retries dead letters with exponential backoff — first attempt succeeds', async () => {
      const { createDeadLetterHandler } = await import('../audit-dead-letter');
      const initHmacKey = vi.fn().mockReturnValue(mockKey);
      const writeAuditRow = vi.fn().mockResolvedValue(undefined);
      const { enqueueDeadLetter, flushDeadLetters } = createDeadLetterHandler(initHmacKey, writeAuditRow);
      enqueueDeadLetter(entry1, new Error('initial fail'));
      vi.advanceTimersByTime(2000);
      await flushDeadLetters();
      expect(writeAuditRow).toHaveBeenCalledWith(entry1, mockKey);
      expect(logger.info).toHaveBeenCalledWith(
        '[AuditLog] Dead letter flushed',
        expect.objectContaining({ entryId: 'entry-1' }),
      );
    });

    it('retries dead letters and removes from queue on success', async () => {
      const { createDeadLetterHandler } = await import('../audit-dead-letter');
      const initHmacKey = vi.fn().mockReturnValue(mockKey);
      const writeAuditRow = vi.fn().mockResolvedValue(undefined);
      const { enqueueDeadLetter, getDeadLetterStatus, flushDeadLetters } = createDeadLetterHandler(initHmacKey, writeAuditRow);
      enqueueDeadLetter(entry1, new Error('fail'));
      expect(getDeadLetterStatus().queued).toBe(1);
      vi.advanceTimersByTime(2000);
      await flushDeadLetters();
      expect(getDeadLetterStatus().queued).toBe(0);
    });

    it('increments attempts on retry failure then flushes on success', async () => {
      const { createDeadLetterHandler } = await import('../audit-dead-letter');
      const initHmacKey = vi.fn().mockReturnValue(mockKey);
      // Reject once (attempts 1->2), then resolve (attempts 2->removed)
      const writeAuditRow = vi.fn()
        .mockRejectedValueOnce(new Error('retry fail 1'))
        .mockResolvedValueOnce(undefined);
      const { enqueueDeadLetter, flushDeadLetters, getDeadLetterStatus } = createDeadLetterHandler(initHmacKey, writeAuditRow);
      enqueueDeadLetter(entry1, new Error('initial'));
      vi.advanceTimersByTime(2000);
      await flushDeadLetters(); // attempts 1->2, backoff 1000ms elapsed
      expect(getDeadLetterStatus().queued).toBe(1);
      // Backoff for attempts=2 is 1000*2^1 = 2000ms; advance past it
      vi.advanceTimersByTime(2001);
      await flushDeadLetters(); // attempts 2->resolved, entry removed
      expect(getDeadLetterStatus().queued).toBe(0);
    });

    it('stores string error when error is not instanceof Error on retry', async () => {
      const { createDeadLetterHandler } = await import('../audit-dead-letter');
      const initHmacKey = vi.fn().mockReturnValue(mockKey);
      const writeAuditRow = vi.fn().mockRejectedValue('string error');
      const { enqueueDeadLetter, flushDeadLetters } = createDeadLetterHandler(initHmacKey, writeAuditRow);
      enqueueDeadLetter(entry1, new Error('initial'));
      vi.advanceTimersByTime(2000);
      await flushDeadLetters();
      expect(logger.warn).toHaveBeenCalledWith(
        '[AuditLog] Dead letter retry failed',
        expect.objectContaining({ error: 'string error' }),
      );
    });

    it('skips entries that have exceeded max attempts', async () => {
      const { createDeadLetterHandler } = await import('../audit-dead-letter');
      const initHmacKey = vi.fn().mockReturnValue(mockKey);
      const writeAuditRow = vi.fn();
      const { enqueueDeadLetter, flushDeadLetters } = createDeadLetterHandler(initHmacKey, writeAuditRow);
      enqueueDeadLetter(entry1, new Error('fail'));
      enqueueDeadLetter(entry2, new Error('fail'));
      vi.advanceTimersByTime(2000);
      await flushDeadLetters(); // attempts -> 2
      vi.advanceTimersByTime(2000);
      await flushDeadLetters(); // attempts -> 3 (max)
      expect(writeAuditRow).toHaveBeenCalledTimes(2);
      // Third flush: entries now at max attempts, should be skipped
      vi.advanceTimersByTime(2000);
      await flushDeadLetters();
      expect(writeAuditRow).toHaveBeenCalledTimes(2);
    });

    it('alerts on persistent failures', async () => {
      const { createDeadLetterHandler } = await import('../audit-dead-letter');
      const initHmacKey = vi.fn().mockReturnValue(mockKey);
      const writeAuditRow = vi.fn().mockRejectedValue(new Error('persist'));
      const { enqueueDeadLetter, flushDeadLetters } = createDeadLetterHandler(initHmacKey, writeAuditRow);
      enqueueDeadLetter(entry1, new Error('initial'));
      enqueueDeadLetter(entry2, new Error('initial'));
      vi.advanceTimersByTime(2000);
      await flushDeadLetters();
      vi.advanceTimersByTime(2000);
      await flushDeadLetters();
      vi.advanceTimersByTime(2000);
      await flushDeadLetters();
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('getDeadLetterStatus', () => {
    it('returns zero status when queue is empty', async () => {
      const { createDeadLetterHandler } = await import('../audit-dead-letter');
      const handlers = createDeadLetterHandler(vi.fn(), vi.fn());
      const status = handlers.getDeadLetterStatus();
      expect(status.queued).toBe(0);
      expect(status.stuck).toBe(0);
      expect(status.oldest).toBeUndefined();
    });

    it('returns queued count and oldest entry age', async () => {
      const { createDeadLetterHandler } = await import('../audit-dead-letter');
      const handlers = createDeadLetterHandler(vi.fn(), vi.fn());
      handlers.enqueueDeadLetter(entry1, new Error('fail'));
      const status = handlers.getDeadLetterStatus();
      expect(status.queued).toBe(1);
      expect(status.stuck).toBe(0);
      expect(status.oldest).toBeGreaterThanOrEqual(0);
    });

    it('counts stuck entries at max attempts', async () => {
      const { createDeadLetterHandler } = await import('../audit-dead-letter');
      const initHmac = vi.fn().mockReturnValue(mockKey);
      const writeFail = vi.fn().mockRejectedValue(new Error('x'));
      const h2 = createDeadLetterHandler(initHmac, writeFail);
      h2.enqueueDeadLetter(entry1, new Error('fail'));
      h2.enqueueDeadLetter(entry2, new Error('fail'));
      vi.advanceTimersByTime(2000);
      await h2.flushDeadLetters();
      vi.advanceTimersByTime(2000);
      await h2.flushDeadLetters();
      vi.advanceTimersByTime(2000);
      await h2.flushDeadLetters();
      const status = h2.getDeadLetterStatus();
      expect(status.stuck).toBe(2);
    });
  });

  describe('integration: full retry cycle', () => {
    it('flushes entries that become due after backoff period', async () => {
      const { createDeadLetterHandler } = await import('../audit-dead-letter');
      const initHmacKey = vi.fn().mockReturnValue(mockKey);
      const writeAuditRow = vi.fn().mockResolvedValue(undefined);
      const { enqueueDeadLetter, flushDeadLetters, getDeadLetterStatus } = createDeadLetterHandler(initHmacKey, writeAuditRow);
      enqueueDeadLetter(entry1, new Error('fail'));
      expect(getDeadLetterStatus().queued).toBe(1);

      vi.advanceTimersByTime(2000);
      await flushDeadLetters();

      expect(getDeadLetterStatus().queued).toBe(0);
      expect(writeAuditRow).toHaveBeenCalledTimes(1);
    });
  });
});