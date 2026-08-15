/**
 * @module security/audit-dead-letter
 *
 * Dead letter queue for failed audit writes.
 *
 * When `writeAuditRow` fails, the entry is enqueued here for automatic
 * retry with exponential backoff. Persistent failures (after
 * {@link MAX_DEAD_LETTER_ATTEMPTS} retries) trigger error-level alerts.
 *
 * Dependencies (`initHmacKey`, `writeAuditRow`) are injected via the
 * factory to avoid circular imports with `audit-log`.
 */

import type { IAuditEntry } from './types';
import { logger } from '../../shared/utils/logger';

// ─── Types ────────────────────────────────────────────────────────────────────

interface DeadLetter {
  entry: IAuditEntry;
  attempts: number;
  lastError: string;
  createdAt: number;
}

// ─── Config ───────────────────────────────────────────────────────────────────

/** Max retry attempts before surfacing to alerts. */
const MAX_DEAD_LETTER_ATTEMPTS = 3;

/** Base delay for exponential backoff (ms). */
const DEAD_LETTER_RETRY_BASE_MS = 1000;

// ─── State ────────────────────────────────────────────────────────────────────

/** Dead letter queue for failed audit writes (in-memory buffer). */
const deadLetterQueue: DeadLetter[] = [];

// ─── Factory ──────────────────────────────────────────────────────────────────

/**
 * Create dead-letter handler functions bound to the given dependencies.
 *
 * This avoids circular imports: `audit-log` passes its own `initHmacKey`
 * and `writeAuditRow` here, keeping the dependency graph acyclic.
 */
export function createDeadLetterHandler(
  initHmacKey: () => Buffer,
  writeAuditRow: (entry: IAuditEntry, key: Buffer) => Promise<void>,
) {
  /** Add failed write to dead letter queue. */
  function enqueueDeadLetter(entry: IAuditEntry, error: Error): void {
    deadLetterQueue.push({
      entry,
      attempts: 1,
      lastError: error.message,
      createdAt: Date.now(),
    });
    logger.warn('[AuditLog] Write failed — enqueued to dead letter queue', {
      entryId: entry.id,
      tenantId: entry.tenantId,
      error: error.message,
      queueLength: deadLetterQueue.length,
    });
  }

  /** Retry dead letters with exponential backoff. */
  async function flushDeadLetters(): Promise<void> {
    if (deadLetterQueue.length === 0) return;
    const key = initHmacKey();
    const now = Date.now();

    const toRetry = deadLetterQueue.filter(
      (dl) =>
        dl.attempts < MAX_DEAD_LETTER_ATTEMPTS &&
        now - dl.createdAt > DEAD_LETTER_RETRY_BASE_MS * 2 ** (dl.attempts - 1),
    );

    for (const dl of toRetry) {
      try {
        await writeAuditRow(dl.entry, key);
        // Remove from queue on success
        const idx = deadLetterQueue.indexOf(dl);
        if (idx >= 0) deadLetterQueue.splice(idx, 1);
        logger.info('[AuditLog] Dead letter flushed', { entryId: dl.entry.id });
      } catch (err) {
        dl.attempts++;
        dl.lastError = err instanceof Error ? err.message : String(err);
        dl.createdAt = now;
        logger.warn('[AuditLog] Dead letter retry failed', {
          entryId: dl.entry.id,
          attempt: dl.attempts,
          error: dl.lastError,
        });
      }
    }

    // Alert on persistent failures
    const stuck = deadLetterQueue.filter(
      (dl) => dl.attempts >= MAX_DEAD_LETTER_ATTEMPTS,
    );
    if (stuck.length > 0) {
      logger.error('[AuditLog] Dead letter queue — persistent failures', {
        stuckCount: stuck.length,
        entries: stuck.map((dl) => ({ id: dl.entry.id, error: dl.lastError })),
      });
    }
  }

  /** Current dead-letter queue status (for health checks). */
  function getDeadLetterStatus(): {
    queued: number;
    stuck: number;
    oldest?: number;
  } {
    const now = Date.now();
    const stuck = deadLetterQueue.filter(
      (dl) => dl.attempts >= MAX_DEAD_LETTER_ATTEMPTS,
    ).length;
    const oldest =
      deadLetterQueue.length > 0
        ? Math.min(...deadLetterQueue.map((dl) => dl.createdAt))
        : undefined;
    return {
      queued: deadLetterQueue.length,
      stuck,
      oldest: oldest ? now - oldest : undefined,
    };
  }

  return { enqueueDeadLetter, flushDeadLetters, getDeadLetterStatus };
}
