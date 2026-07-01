/**
 * Webhook Resilience Module
 * Provides idempotency, retry with exponential backoff, and dead-letter queue
 * for failed payment webhook processing.
 *
 * Usage: wrap any webhook handler with processWebhook(event, handler)
 * Dead-letter endpoints: GET /dead-letter, POST /dead-letter/:id/retry
 */

import { Router, Request, Response } from 'express';
import { logger } from '../../../../shared/utils/logger';

export interface WebhookEvent {
  id: string;           // idempotency key (from webhook payload)
  provider: string;     // e.g. 'nowpayments'
  payload: unknown;
  receivedAt: number;
  attempts: number;
  lastAttemptAt: number | null;
  status: 'pending' | 'processed' | 'failed' | 'dead-letter';
}

type WebhookHandler = (event: WebhookEvent) => Promise<void>;

// --- In-memory stores ---

/** Processed IDs with timestamp for TTL eviction (1h) */
const processedIds = new Map<string, number>();

/** Retry queue: events awaiting re-processing */
const retryQueue = new Map<string, WebhookEvent>();

/** Dead-letter store: events that exhausted all retries */
const deadLetterQueue = new Map<string, WebhookEvent>();

// --- Constants ---
const MAX_RETRIES = 5;
const IDEMPOTENCY_TTL_MS = 60 * 60 * 1000; // 1 hour
const RETRY_INTERVAL_MS = 5_000;            // poll every 5s
const BACKOFF_BASE_MS = 1_000;              // 1s, 2s, 4s, 8s, 16s

// --- Idempotency ---

/** Purge processedIds older than 1h to prevent unbounded memory growth */
function purgeExpiredIds(): void {
  const cutoff = Date.now() - IDEMPOTENCY_TTL_MS;
  for (const [id, ts] of processedIds) {
    if (ts < cutoff) processedIds.delete(id);
  }
}

function isAlreadyProcessed(eventId: string): boolean {
  purgeExpiredIds();
  return processedIds.has(eventId);
}

function markProcessed(eventId: string): void {
  processedIds.set(eventId, Date.now());
}

// --- Backoff ---

function backoffDelayMs(attempt: number): number {
  // attempt 1 → 1s, 2 → 2s, 3 → 4s, 4 → 8s, 5 → 16s
  return BACKOFF_BASE_MS * Math.pow(2, attempt - 1);
}

function isReadyForRetry(event: WebhookEvent): boolean {
  if (event.lastAttemptAt === null) return true;
  const delay = backoffDelayMs(event.attempts);
  return Date.now() - event.lastAttemptAt >= delay;
}

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

// Handlers registered per provider for retry processing
const handlerRegistry = new Map<string, WebhookHandler>();

export function registerHandler(provider: string, handler: WebhookHandler): void {
  handlerRegistry.set(provider, handler);
}

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
webhookResilienceRouter.get('/dead-letter', (_req: Request, res: Response) => {
  const events = Array.from(deadLetterQueue.values());
  return res.json({ count: events.length, events });
});

/** POST /api/v1/webhooks/dead-letter/:id/retry — manually retry a dead-lettered event */
webhookResilienceRouter.post('/dead-letter/:id/retry', async (req: Request, res: Response) => {
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
