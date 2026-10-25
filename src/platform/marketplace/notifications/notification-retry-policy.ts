/**
 * Notification Retry Policy
 *
 * Delivery outcome state machine for queued notifications: what happens to an
 * attempt counter, status and retry deadline after one delivery attempt.
 * Extracted from the queue drain so the retry rules are testable without a
 * running service instance.
 */

import type { NotificationPayload } from './notification-types';

export type DeliveryOutcome = 'sent' | 'retry' | 'dead_letter';

/** Result of applying the retry policy to one delivery attempt. */
export interface DeliveryAttemptResult {
  outcome: DeliveryOutcome;
  /** Logistics-only detail for the caller's log line. */
  nextRetryAt?: Date;
  attempts: number;
  error?: string;
}

/**
 * Apply the retry policy to a failed delivery attempt.
 *
 * Mutates the notification in place (attempts, status, nextRetryAt) so the
 * caller's live queue reflects the decision, and returns the outcome for
 * logging. A notification whose attempt count reaches maxAttempts is marked
 * dead_letter for the caller to move aside.
 *
 * @param backoff Delay before the next attempt, computed from the *incremented*
 *   attempt count. Injected so the caller keeps its own overridable seam.
 */
export function applyRetryPolicy(
  notification: NotificationPayload,
  attemptedAt: Date,
  error: unknown,
  backoff: (attempt: number) => number,
): DeliveryAttemptResult {
  notification.attempts += 1;
  const message = error instanceof Error ? error.message : String(error);

  if (notification.attempts >= notification.maxAttempts) {
    notification.status = 'dead_letter';
    return { outcome: 'dead_letter', attempts: notification.attempts, error: message };
  }

  notification.status = 'queued';
  notification.nextRetryAt = new Date(attemptedAt.getTime() + backoff(notification.attempts));
  return {
    outcome: 'retry',
    attempts: notification.attempts,
    nextRetryAt: notification.nextRetryAt,
    error: message,
  };
}
