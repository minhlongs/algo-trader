/**
 * Notification Service — in-memory queue with retry for marketplace events.
 */

import { logger } from '../../../shared/utils/logger';
import type {
  NotificationPayload,
  SubscriptionNotificationData,
  PayoutNotificationData,
  DisputeNotificationData,
} from './notification-types';
import {
  calculateBackoffMs,
  generateNotificationId,
  buildSubscriptionNotifications,
  buildPayoutNotification,
  buildDisputeNotifications,
} from './notification-helpers';
import { applyRetryPolicy } from './notification-retry-policy';

export type {
  NotificationPayload, NotificationType, NotificationStatus,
  SubscriptionNotificationData, PayoutNotificationData, DisputeNotificationData,
} from './notification-types';

export class NotificationService {
  private static instance: NotificationService | null = null;
  private queue: NotificationPayload[] = [];
  private deadLetter: NotificationPayload[] = [];
  private processing = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  private processIntervalMs: number;

  private constructor(processIntervalMs = 5_000) {
    this.processIntervalMs = processIntervalMs;
  }

  static getInstance(processIntervalMs?: number): NotificationService {
    if (!NotificationService.instance) {
      NotificationService.instance = new NotificationService(processIntervalMs);
    }
    return NotificationService.instance;
  }

  enqueue(payload: Omit<NotificationPayload, 'id' | 'createdAt' | 'attempts' | 'status'>): NotificationPayload {
    const notification: NotificationPayload = {
      ...payload,
      id: generateNotificationId(payload.type),
      createdAt: new Date(),
      attempts: 0,
      status: 'queued',
    };
    this.queue.push(notification);
    logger.info('[NotificationService] Enqueued', {
      notificationId: notification.id, type: notification.type, recipient: notification.recipient,
    });
    return notification;
  }

  sendSubscriptionConfirmation(data: SubscriptionNotificationData): { buyer: NotificationPayload; seller: NotificationPayload } {
    return buildSubscriptionNotifications((p) => this.enqueue(p), data);
  }

  sendPayoutNotification(data: PayoutNotificationData): NotificationPayload {
    return buildPayoutNotification((p) => this.enqueue(p), data);
  }

  sendDisputeNotification(data: DisputeNotificationData): { filer: NotificationPayload; respondent: NotificationPayload } {
    return buildDisputeNotifications((p) => this.enqueue(p), data);
  }

  /** Process the queue — drain queued items with retry on failure. */
  async processQueue(): Promise<void> {
    if (this.processing) return;
    this.processing = true;

    try {
      const now = new Date();
      const ready = this.queue.filter(
        (n) => n.status === 'queued' && (!n.nextRetryAt || n.nextRetryAt <= now),
      );

      for (const notification of ready) {
        try {
          await this.deliver(notification);
          notification.status = 'sent';
          logger.info('[NotificationService] Sent', {
            notificationId: notification.id,
            type: notification.type,
            recipient: notification.recipient,
          });
        } catch (err) {
          const outcome = applyRetryPolicy(notification, now, err, this.backoffMs.bind(this));
          if (outcome.outcome === 'dead_letter') {
            this.deadLetter.push(notification);
            this.queue = this.queue.filter((n) => n.id !== notification.id);
            logger.error('[NotificationService] Moved to dead letter', {
              notificationId: notification.id,
              attempts: outcome.attempts,
              error: outcome.error,
            });
          } else {
            logger.warn('[NotificationService] Retry scheduled', {
              notificationId: notification.id,
              attempt: outcome.attempts,
              nextRetryAt: outcome.nextRetryAt?.toISOString(),
            });
          }
        }
      }
    } finally {
      this.processing = false;
    }
  }

  /** Start background processing loop. */
  start(): void {
    if (this.timer) return;
    logger.info('[NotificationService] Starting queue processor', { intervalMs: this.processIntervalMs });
    this.timer = setInterval(() => void this.processQueue(), this.processIntervalMs);
  }

  /** Stop background processing. */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    logger.info('[NotificationService] Stopped');
  }

  /** Queue depth for monitoring. */
  get queueLength(): number {
    return this.queue.filter((n) => n.status === 'queued').length;
  }

  get deadLetterCount(): number {
    return this.deadLetter.length;
  }

  // ── Private ──────────────────────────────────────────────────────

  /** Backoff before the next attempt; kept as a seam for tests. */
  private backoffMs(attempt: number): number {
    return calculateBackoffMs(attempt);
  }

  private async deliver(notification: NotificationPayload): Promise<void> {
    logger.info('[NotificationService] Delivery (logged)', {
      notificationId: notification.id,
      type: notification.type,
      recipient: notification.recipient,
      subject: notification.subject,
      body: notification.body,
      metadata: notification.metadata,
    });
  }
}
