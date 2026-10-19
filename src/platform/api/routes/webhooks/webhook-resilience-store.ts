/**
 * Webhook Resilience Store & Idempotency / Backoff Helpers
 */

export interface WebhookEvent {
  id: string;           // idempotency key (from webhook payload)
  provider: string;     // e.g. 'nowpayments'
  payload: unknown;
  receivedAt: number;
  attempts: number;
  lastAttemptAt: number | null;
  status: 'pending' | 'processed' | 'failed' | 'dead-letter';
}

export type WebhookHandler = (event: WebhookEvent) => Promise<void>;

// --- In-memory stores ---

/** Processed IDs with timestamp for TTL eviction (1h) */
export const processedIds = new Map<string, number>();

/** Retry queue: events awaiting re-processing */
export const retryQueue = new Map<string, WebhookEvent>();

/** Dead-letter store: events that exhausted all retries */
export const deadLetterQueue = new Map<string, WebhookEvent>();

// Handlers registered per provider for retry processing
export const handlerRegistry = new Map<string, WebhookHandler>();

// --- Constants ---
export const MAX_RETRIES = 5;
export const IDEMPOTENCY_TTL_MS = 60 * 60 * 1000; // 1 hour
export const RETRY_INTERVAL_MS = 5_000;            // poll every 5s
export const BACKOFF_BASE_MS = 1_000;              // 1s, 2s, 4s, 8s, 16s

// --- Idempotency ---

/** Purge processedIds older than 1h to prevent unbounded memory growth */
export function purgeExpiredIds(): void {
  const cutoff = Date.now() - IDEMPOTENCY_TTL_MS;
  for (const [id, ts] of processedIds) {
    if (ts < cutoff) processedIds.delete(id);
  }
}

export function isAlreadyProcessed(eventId: string): boolean {
  purgeExpiredIds();
  return processedIds.has(eventId);
}

export function markProcessed(eventId: string): void {
  processedIds.set(eventId, Date.now());
}

// --- Backoff ---

export function backoffDelayMs(attempt: number): number {
  // attempt 1 → 1s, 2 → 2s, 3 → 4s, 4 → 8s, 5 → 16s
  return BACKOFF_BASE_MS * Math.pow(2, attempt - 1);
}

export function isReadyForRetry(event: WebhookEvent): boolean {
  if (event.lastAttemptAt === null) return true;
  const delay = backoffDelayMs(event.attempts);
  return Date.now() - event.lastAttemptAt >= delay;
}

export function registerHandler(provider: string, handler: WebhookHandler): void {
  handlerRegistry.set(provider, handler);
}
