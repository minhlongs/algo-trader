export type NotificationType =
  | 'subscription_confirmation'
  | 'payout_notification'
  | 'dispute_notification';

export type NotificationStatus = 'queued' | 'sent' | 'failed' | 'dead_letter';

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
