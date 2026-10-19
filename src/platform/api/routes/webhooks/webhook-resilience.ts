/**
 * Webhook Resilience Module
 * Provides idempotency, retry with exponential backoff, and dead-letter queue
 * for failed payment webhook processing.
 *
 * Usage: wrap any webhook handler with processWebhook(event, handler)
 * Dead-letter endpoints: GET /dead-letter, POST /dead-letter/:id/retry
 */

import { Router, Request, Response } from 'express';
import { logger } from '../../../utils/logger';
import { requireAdminKey } from '../../middleware/require-admin-key';
import {
  type WebhookEvent,
  type WebhookHandler,
  processedIds,
  retryQueue,
  deadLetterQueue,
  handlerRegistry,
  MAX_RETRIES,
  RETRY_INTERVAL_MS,
  isAlreadyProcessed,
  markProcessed,
  isReadyForRetry,
  registerHandler,
} from './webhook-resilience-store';

export type { WebhookEvent, WebhookHandler };
export {
  processedIds,
  retryQueue,
  deadLetterQueue,
  handlerRegistry,
  MAX_RETRIES,
  registerHandler,
};

// --- Core processor ---

async function attempt(event: WebhookEvent, handler: WebhookHandler): Promise<void> {
  event.attempts += 1;
  event.lastAttemptAt = Date.now();
  await handler(event);
}

/**
 * Process a webhook event with idempotency + retry resilience.
 * Returns true if accepted (new or already processed), throws on hard error.
 */
export async function processWebhook(
  event: WebhookEvent,
  handler: WebhookHandler
): Promise<{ duplicate: boolean }> {
  if (isAlreadyProcessed(event.id)) {
    logger.info(`[WebhookResilience] Duplicate event skipped id=${event.id}`);
    return { duplicate: true };
  }

  try {
    await attempt(event, handler);
    markProcessed(event.id);
    event.status = 'processed';
    logger.info(`[WebhookResilience] Processed id=${event.id} provider=${event.provider}`);
    return { duplicate: false };
  } catch (err) {
    logger.warn(`[WebhookResilience] Handler failed id=${event.id} attempts=${event.attempts}`, { err });

    if (event.attempts >= MAX_RETRIES) {
      event.status = 'dead-letter';
      deadLetterQueue.set(event.id, event);
      logger.error(`[WebhookResilience] Dead-lettered id=${event.id} after ${event.attempts} attempts`);
    } else {
      event.status = 'failed';
      retryQueue.set(event.id, event);
      logger.info(`[WebhookResilience] Queued for retry id=${event.id} next attempt #${event.attempts + 1}`);
    }

    // Rethrow so the route can return 500 to the provider (triggers provider-side retry too)
    throw err;
  }
}

// --- Retry worker ---

async function runRetryPass(): Promise<void> {
  for (const [id, event] of retryQueue) {
    if (!isReadyForRetry(event)) continue;

    const handler = handlerRegistry.get(event.provider);
    if (!handler) {
      logger.warn(`[WebhookResilience] No handler for provider=${event.provider}, skipping id=${id}`);
      continue;
    }

    retryQueue.delete(id);
    try {
      await processWebhook(event, handler);
    } catch {
      // processWebhook handles re-queueing or dead-lettering internally
    }
  }
}

// Start background retry worker
setInterval(runRetryPass, RETRY_INTERVAL_MS);

// --- Express router for dead-letter management ---

export const webhookResilienceRouter: Router = Router();

/** GET /api/v1/webhooks/dead-letter — list all dead-lettered events */
webhookResilienceRouter.get('/dead-letter', (req: Request, res: Response) => {
  if (!requireAdminKey(req, res)) return;
  const events = Array.from(deadLetterQueue.values());
  return res.json({ count: events.length, events });
});

/** POST /api/v1/webhooks/dead-letter/:id/retry — manually retry a dead-lettered event */
webhookResilienceRouter.post('/dead-letter/:id/retry', async (req: Request, res: Response) => {
  if (!requireAdminKey(req, res)) return;
  const id = req.params['id'] as string;
  const event = deadLetterQueue.get(id);

  if (!event) {
    return res.status(404).json({ error: 'Event not found in dead-letter queue' });
  }

  const handler = handlerRegistry.get(event.provider);
  if (!handler) {
    return res.status(422).json({ error: `No handler registered for provider=${event.provider}` });
  }

  deadLetterQueue.delete(id);

  // Reset for a fresh retry cycle
  event.status = 'pending';
  event.attempts = 0;
  event.lastAttemptAt = null;

  // Remove from idempotency cache so handler runs again
  processedIds.delete(id);

  try {
    await processWebhook(event, handler);
    return res.json({ success: true, event });
  } catch {
    return res.status(500).json({ error: 'Retry failed, re-queued or dead-lettered', event });
  }
});

