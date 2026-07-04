/**
 * Signal Publisher — platform-level signal dispatch for the signals API marketplace.
 *
 * Subscribes to FusionResult output from signal-fusion-engine.ts and dispatches
 * to registered subscribers via in-memory queue with tier-based rate limiting
 * and optional webhook delivery.
 *
 * Tier rate limits (signals/minute):
 *   FREE:  2    STARTER: 10   PRO: 30   ENTERPRISE: 120   MASTER: unlimited
 */

import { logger } from '../../shared/utils/logger';
import type { FusionResult } from '../../desk/intelligence/signal-fusion-engine';
import { SignalSubscriptionService, TIER_RATE_LIMITS } from './signal-subscription-service';
import type { TierLabel } from './signal-subscription-service';

// ── Types ───────────────────────────────────────────────────────────────────────

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

type WebhookHandler = (event: SignalEvent) => Promise<void>;

// ── Defaults ────────────────────────────────────────────────────────────────────

const DEFAULT_MAX_QUEUE_SIZE = 100;
const DEFAULT_RATE_LIMIT_WINDOW_MS = 60_000;
const DEFAULT_WEBHOOK_TIMEOUT_MS = 5_000;

// ── Publisher ───────────────────────────────────────────────────────────────────

export class SignalPublisher {
  private subscriptionService: SignalSubscriptionService;
  /** Per-subscriber event queue: subscriberId -> SignalEvent[] */
  private queues: Map<string, SignalEvent[]> = new Map();
  /** Per-subscriber delivery timestamps for rate limiting: subscriberId -> number[] */
  private deliveryLog: Map<string, number[]> = new Map();
  /** Registered webhook handlers: subscriberId -> handler */
  private webhookHandlers: Map<string, WebhookHandler> = new Map();
  private maxQueueSize: number;
  private rateLimitWindowMs: number;
  private webhookTimeoutMs: number;

  constructor(
    subscriptionService: SignalSubscriptionService,
    options?: PublisherOptions,
  ) {
    this.subscriptionService = subscriptionService;
    this.maxQueueSize = options?.maxQueueSize ?? DEFAULT_MAX_QUEUE_SIZE;
    this.rateLimitWindowMs = options?.rateLimitWindowMs ?? DEFAULT_RATE_LIMIT_WINDOW_MS;
    this.webhookTimeoutMs = options?.webhookTimeoutMs ?? DEFAULT_WEBHOOK_TIMEOUT_MS;
  }

  // ── Publish ────────────────────────────────────────────────────────────────────

  /**
   * Publish a FusionResult to all eligible subscribers.
   * Applies rate limiting per subscriber tier. Creates a SignalEvent per subscriber
   * and enqueues it. If a webhook handler is registered, attempts async delivery.
   */
  async publish(result: FusionResult): Promise<void> {
    const subscribers = this.subscriptionService.list();
    if (subscribers.length === 0) {
      logger.debug('[SignalPublisher] No subscribers — signal dropped');
      return;
    }

    for (const sub of subscribers) {
      if (sub.status !== 'active') continue;

      const tier = sub.tier;
      if (!this.canSend(tier, sub.id)) {
        logger.debug('[SignalPublisher] Rate limited', {
          subscriberId: sub.id,
          tier,
        });
        continue;
      }

      // Create event for each constituent signal in the fusion result
      for (const signal of result.signals) {
        const event = this.buildEvent(sub.id, signal, result);
        this.enqueue(sub.id, event);
        this.recordDelivery(sub.id);

        // Invoke webhook handler if registered
        const handler = this.webhookHandlers.get(sub.id);
        if (handler) {
          this.deliverWebhook(sub.id, handler, event);
        }
      }
    }

    // Skip firing a catch-all event when there are no individual signals
    if (result.signals.length === 0) {
      const subscribersWithoutSignals = subscribers.filter((s) => s.status === 'active');
      for (const sub of subscribersWithoutSignals) {
        if (!this.canSend(sub.tier, sub.id)) continue;
        const event = this.buildEvent(sub.id, null, result);
        this.enqueue(sub.id, event);
        this.recordDelivery(sub.id);
        const handler = this.webhookHandlers.get(sub.id);
        if (handler) {
          this.deliverWebhook(sub.id, handler, event);
        }
      }
    }
  }

  // ── Feed ───────────────────────────────────────────────────────────────────────

  /**
   * Get recent signal events for a subscriber.
   * Returns up to `limit` events in reverse chronological order (newest first).
   */
  getFeed(subscriberId: string, limit: number = 20): SignalEvent[] {
    const queue = this.queues.get(subscriberId);
    if (!queue) return [];
    return queue.slice(-limit).reverse();
  }

  // ── Webhook Registration ──────────────────────────────────────────────────────

  /**
   * Register a webhook handler for a subscriber.
   * The handler is called for each signal event delivered to that subscriber.
   * Overwrites any previously registered handler.
   */
  registerWebhook(subscriberId: string, handler: WebhookHandler): void {
    this.webhookHandlers.set(subscriberId, handler);
    logger.info('[SignalPublisher] Webhook registered', { subscriberId });
  }

  // ── Internal helpers ──────────────────────────────────────────────────────────

  private buildEvent(
    subscriberId: string,
    signal: { name: string; score: number } | null,
    result: FusionResult,
  ): SignalEvent {
    return {
      id: crypto.randomUUID(),
      subscriberId,
      signalName: signal?.name ?? result.direction,
      score: signal?.score ?? result.weightedScore,
      confidence: result.confidence,
      direction: result.direction,
      reasoning: result.reasoning,
      createdAt: Date.now(),
    };
  }

  private enqueue(subscriberId: string, event: SignalEvent): void {
    let queue = this.queues.get(subscriberId);
    if (!queue) {
      queue = [];
      this.queues.set(subscriberId, queue);
    }
    queue.push(event);

    // Trim oldest entries when exceeding max queue size
    if (queue.length > this.maxQueueSize) {
      queue.splice(0, queue.length - this.maxQueueSize);
    }
  }

  /**
   * Check whether a subscriber can receive signals based on tier rate limit.
   * Counts deliveries within the rate limit window.
   */
  private canSend(tier: TierLabel, subscriberId: string): boolean {
    const limit = TIER_RATE_LIMITS[tier];
    // -1 means unlimited
    if (limit === -1) return true;

    const now = Date.now();
    const windowStart = now - this.rateLimitWindowMs;
    const log = this.deliveryLog.get(subscriberId);
    if (!log) return limit > 0;

    // Purge entries outside the window
    const recent = log.filter((ts) => ts >= windowStart);
    this.deliveryLog.set(subscriberId, recent);

    return recent.length < limit;
  }

  private recordDelivery(subscriberId: string): void {
    const now = Date.now();
    let log = this.deliveryLog.get(subscriberId);
    if (!log) {
      log = [];
      this.deliveryLog.set(subscriberId, log);
    }
    log.push(now);
  }

  private async deliverWebhook(
    subscriberId: string,
    handler: WebhookHandler,
    event: SignalEvent,
  ): Promise<void> {
    try {
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Webhook timeout')), this.webhookTimeoutMs),
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

  // ── Testing / introspection helpers ───────────────────────────────────────────

  /** Clear all internal state (for test isolation). */
  clear(): void {
    this.queues.clear();
    this.deliveryLog.clear();
    this.webhookHandlers.clear();
  }

  /** Expose queue for introspection (testing only). */
  getQueue(subscriberId: string): SignalEvent[] {
    return this.queues.get(subscriberId) ?? [];
  }
}
