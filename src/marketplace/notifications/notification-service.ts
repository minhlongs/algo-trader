/**
 * Notification Service — in-memory queue with retry for marketplace events.
 *
 * Real implementation would call an email/SMS provider (SendGrid, Twilio, etc.).
 * This module logs every notification so ops can verify delivery without external
 * dependencies.
 */

import { logger } from '../../utils/logger';

// ── Types ──────────────────────────────────────────────────────────

export interface NotificationPayload {
  id: string;
  type: NotificationType;
  recipient: string;
  subject: string;
  body: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  attempts: number;
  maxAttempts: number;
  nextRetryAt?: Date;
  status: NotificationStatus;
}

export type NotificationType =
  | 'subscription_confirmation'
  | 'payout_notification'
  | 'dispute_notification';

export type NotificationStatus = 'queued' | 'sent' | 'failed' | 'dead_letter';

export interface SubscriptionNotificationData {
  subscriptionId: string;
  buyerId: string;
  sellerId: string;
  strategyName: string;
  priceUsdMonthly: number;
}

export interface PayoutNotificationData {
  payoutId: string;
  creatorId: string;
  amountCents: number;
  periodStart: string;
  periodEnd: string;
  strategyName: string;
}

export interface DisputeNotificationData {
  disputeId: string;
  filerId: string;
  respondentId: string;
  reason: string;
  listingId: string;
}

// ── Service ────────────────────────────────────────────────────────

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

  /** Enqueue a notification. */
  enqueue(payload: Omit<NotificationPayload, 'id' | 'createdAt' | 'attempts' | 'status'>): NotificationPayload {
    const notification: NotificationPayload = {
      ...payload,
      id: this.generateId(payload.type),
      createdAt: new Date(),
      attempts: 0,
      status: 'queued',
    };
    this.queue.push(notification);
    logger.info('[NotificationService] Enqueued', {
      notificationId: notification.id,
      type: notification.type,
      recipient: notification.recipient,
    });
    return notification;
  }

  /** Send subscription confirmation to buyer and seller. */
  sendSubscriptionConfirmation(data: SubscriptionNotificationData): { buyer: NotificationPayload; seller: NotificationPayload } {
    const buyerSubject = `Subscription confirmed: ${data.strategyName}`;
    const buyerBody = `You have successfully subscribed to "${data.strategyName}" at $${(data.priceUsdMonthly / 100).toFixed(2)}/month. Subscription ID: ${data.subscriptionId}.`;

    const sellerSubject = `New subscriber for ${data.strategyName}`;
    const sellerBody = `Your strategy "${data.strategyName}" has a new subscriber (${data.buyerId}). Subscription ID: ${data.subscriptionId}.`;

    const buyer = this.enqueue({
      type: 'subscription_confirmation',
      recipient: data.buyerId,
      subject: buyerSubject,
      body: buyerBody,
      metadata: { subscriptionId: data.subscriptionId, strategyName: data.strategyName },
      maxAttempts: 3,
    });

    const seller = this.enqueue({
      type: 'subscription_confirmation',
      recipient: data.sellerId,
      subject: sellerSubject,
      body: sellerBody,
      metadata: { subscriptionId: data.subscriptionId, strategyName: data.strategyName, role: 'seller' },
      maxAttempts: 3,
    });

    return { buyer, seller };
  }

  /** Send payout notification to creator. */
  sendPayoutNotification(data: PayoutNotificationData): NotificationPayload {
    const subject = `Payout processed: $${(data.amountCents / 100).toFixed(2)} for ${data.strategyName}`;
    const body =
      `Your payout of $${(data.amountCents / 100).toFixed(2)} for "${data.strategyName}" ` +
      `has been processed. Period: ${data.periodStart} to ${data.periodEnd}. Payout ID: ${data.payoutId}.`;

    return this.enqueue({
      type: 'payout_notification',
      recipient: data.creatorId,
      subject,
      body,
      metadata: data as unknown as Record<string, unknown>,
      maxAttempts: 3,
    });
  }

  /** Send dispute notification to both parties. */
  sendDisputeNotification(data: DisputeNotificationData): { filer: NotificationPayload; respondent: NotificationPayload } {
    const reasonLabel = data.reason.replace(/_/g, ' ');

    const filerSubject = `Dispute filed: ${reasonLabel}`;
    const filerBody = `You have filed a dispute (${data.disputeId}) for listing ${data.listingId}. Reason: ${reasonLabel}. We will review your case.`;

    const respondentSubject = `Dispute filed against your listing: ${reasonLabel}`;
    const respondentBody =
      `A dispute (${data.disputeId}) has been filed against your listing (${data.listingId}). ` +
      `Reason: ${reasonLabel}. The platform team will review and reach out.`;

    const filer = this.enqueue({
      type: 'dispute_notification',
      recipient: data.filerId,
      subject: filerSubject,
      body: filerBody,
      metadata: { disputeId: data.disputeId, listingId: data.listingId, reason: data.reason },
      maxAttempts: 3,
    });

    const respondent = this.enqueue({
      type: 'dispute_notification',
      recipient: data.respondentId,
      subject: respondentSubject,
      body: respondentBody,
      metadata: { disputeId: data.disputeId, listingId: data.listingId, reason: data.reason },
      maxAttempts: 3,
    });

    return { filer, respondent };
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
          notification.attempts += 1;
          if (notification.attempts >= notification.maxAttempts) {
            notification.status = 'dead_letter';
            this.deadLetter.push(notification);
            this.queue = this.queue.filter((n) => n.id !== notification.id);
            logger.error('[NotificationService] Moved to dead letter', {
              notificationId: notification.id,
              attempts: notification.attempts,
              error: err instanceof Error ? err.message : String(err),
            });
          } else {
            notification.status = 'queued';
            notification.nextRetryAt = new Date(now.getTime() + this.backoffMs(notification.attempts));
            logger.warn('[NotificationService] Retry scheduled', {
              notificationId: notification.id,
              attempt: notification.attempts,
              nextRetryAt: notification.nextRetryAt.toISOString(),
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

  private async deliver(_notification: NotificationPayload): Promise<void> {
    // Real implementation: call email/SMS provider here.
    // For now, log the delivery so ops can verify the pipeline.
    logger.info('[NotificationService] Delivery (logged)', {
      notificationId: _notification.id,
      type: _notification.type,
      recipient: _notification.recipient,
      subject: _notification.subject,
      body: _notification.body,
      metadata: _notification.metadata,
    });
  }

  private backoffMs(attempt: number): number {
    return Math.min(1000 * 2 ** attempt, 60_000); // cap at 60s
  }

  private generateId(type: NotificationType): string {
    const prefix: Record<NotificationType, string> = {
      subscription_confirmation: 'notif_sub',
      payout_notification: 'notif_pay',
      dispute_notification: 'notif_disp',
    };
    return `${prefix[type]}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }
}
