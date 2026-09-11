/**
 * Signal Webhook Dispatcher
 * Dispatches webhook events with timeout protection and error logging.
 */

import { logger } from '../../shared/utils/logger';
import type { SignalEvent, WebhookHandler } from './signal-publisher-types';

export async function deliverSubscriberWebhook(
  subscriberId: string,
  handler: WebhookHandler,
  event: SignalEvent,
  webhookTimeoutMs: number,
): Promise<void> {
  try {
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Webhook timeout')), webhookTimeoutMs),
    );
    await Promise.race([handler(event), timeout]);
    logger.debug('[SignalPublisher] Webhook delivered', {
      subscriberId,
      eventId: event.id,
    });
  } catch (err) {
    logger.warn('[SignalPublisher] Webhook delivery failed', {
      subscriberId,
      eventId: event.id,
      err,
    });
  }
}
