/**
 * Signal Publisher Types & Defaults
 * Shared event models and publisher configuration options.
 */

export interface SignalEvent {
  id: string;
  subscriberId: string;
  signalName: string;
  score: number;
  confidence: number;
  direction: 'UP' | 'DOWN' | 'NEUTRAL';
  reasoning: string;
  createdAt: number;
}

export interface PublisherOptions {
  /** Max events kept per subscriber queue (default 100) */
  maxQueueSize?: number;
  /** Window for rate limit checks in ms (default 60_000 = 1 minute) */
  rateLimitWindowMs?: number;
  /** Timeout for webhook delivery in ms (default 5_000) */
  webhookTimeoutMs?: number;
}

export type WebhookHandler = (event: SignalEvent) => Promise<void>;

export const DEFAULT_MAX_QUEUE_SIZE = 100;
export const DEFAULT_RATE_LIMIT_WINDOW_MS = 60_000;
export const DEFAULT_WEBHOOK_TIMEOUT_MS = 5_000;
