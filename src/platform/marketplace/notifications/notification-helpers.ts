import type {
  NotificationPayload,
  NotificationType,
  SubscriptionNotificationData,
  PayoutNotificationData,
  DisputeNotificationData,
} from './notification-types';

export function calculateBackoffMs(attempt: number): number {
  return Math.min(1000 * 2 ** attempt, 60_000); // cap at 60s
}

export function generateNotificationId(type: NotificationType): string {
  const prefix: Record<NotificationType, string> = {
    subscription_confirmation: 'notif_sub',
    payout_notification: 'notif_pay',
    dispute_notification: 'notif_disp',
  };
  return `${prefix[type]}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function formatSubscriptionConfirmation(data: SubscriptionNotificationData): {
  buyerSubject: string;
  buyerBody: string;
  sellerSubject: string;
  sellerBody: string;
} {
  const buyerSubject = `Subscription confirmed: ${data.strategyName}`;
  const buyerBody = `You have successfully subscribed to "${data.strategyName}" at $${(data.priceUsdMonthly / 100).toFixed(2)}/month. Subscription ID: ${data.subscriptionId}.`;

  const sellerSubject = `New subscriber for ${data.strategyName}`;
  const sellerBody = `Your strategy "${data.strategyName}" has a new subscriber (${data.buyerId}). Subscription ID: ${data.subscriptionId}.`;

  return { buyerSubject, buyerBody, sellerSubject, sellerBody };
}

export function formatPayoutNotification(data: PayoutNotificationData): {
  subject: string;
  body: string;
} {
  const subject = `Payout processed: $${(data.amountCents / 100).toFixed(2)} for ${data.strategyName}`;
  const body =
    `Your payout of $${(data.amountCents / 100).toFixed(2)} for "${data.strategyName}" ` +
    `has been processed. Period: ${data.periodStart} to ${data.periodEnd}. Payout ID: ${data.payoutId}.`;

  return { subject, body };
}

export function formatDisputeNotification(data: DisputeNotificationData): {
  filerSubject: string;
  filerBody: string;
  respondentSubject: string;
  respondentBody: string;
} {
  const reasonLabel = data.reason.replace(/_/g, ' ');

  const filerSubject = `Dispute filed: ${reasonLabel}`;
  const filerBody = `You have filed a dispute (${data.disputeId}) for listing ${data.listingId}. Reason: ${reasonLabel}. We will review your case.`;

  const respondentSubject = `Dispute filed against your listing: ${reasonLabel}`;
  const respondentBody =
    `A dispute (${data.disputeId}) has been filed against your listing (${data.listingId}). ` +
    `Reason: ${reasonLabel}. The platform team will review and reach out.`;

  return { filerSubject, filerBody, respondentSubject, respondentBody };
}

type EnqueueFn = (payload: Omit<NotificationPayload, 'id' | 'createdAt' | 'attempts' | 'status'>) => NotificationPayload;

export function buildSubscriptionNotifications(
  enqueue: EnqueueFn,
  data: SubscriptionNotificationData,
): { buyer: NotificationPayload; seller: NotificationPayload } {
  const { buyerSubject, buyerBody, sellerSubject, sellerBody } = formatSubscriptionConfirmation(data);

  const buyer = enqueue({
    type: 'subscription_confirmation',
    recipient: data.buyerId,
    subject: buyerSubject,
    body: buyerBody,
    metadata: { subscriptionId: data.subscriptionId, strategyName: data.strategyName },
    maxAttempts: 3,
  });

  const seller = enqueue({
    type: 'subscription_confirmation',
    recipient: data.sellerId,
    subject: sellerSubject,
    body: sellerBody,
    metadata: { subscriptionId: data.subscriptionId, strategyName: data.strategyName, role: 'seller' },
    maxAttempts: 3,
  });

  return { buyer, seller };
}

export function buildPayoutNotification(
  enqueue: EnqueueFn,
  data: PayoutNotificationData,
): NotificationPayload {
  const { subject, body } = formatPayoutNotification(data);

  return enqueue({
    type: 'payout_notification',
    recipient: data.creatorId,
    subject,
    body,
    metadata: data as unknown as Record<string, unknown>,
    maxAttempts: 3,
  });
}

export function buildDisputeNotifications(
  enqueue: EnqueueFn,
  data: DisputeNotificationData,
): { filer: NotificationPayload; respondent: NotificationPayload } {
  const { filerSubject, filerBody, respondentSubject, respondentBody } = formatDisputeNotification(data);

  const filer = enqueue({
    type: 'dispute_notification',
    recipient: data.filerId,
    subject: filerSubject,
    body: filerBody,
    metadata: { disputeId: data.disputeId, listingId: data.listingId, reason: data.reason },
    maxAttempts: 3,
  });

  const respondent = enqueue({
    type: 'dispute_notification',
    recipient: data.respondentId,
    subject: respondentSubject,
    body: respondentBody,
    metadata: { disputeId: data.disputeId, listingId: data.listingId, reason: data.reason },
    maxAttempts: 3,
  });

  return { filer, respondent };
}
