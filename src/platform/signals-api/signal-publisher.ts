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
import { SignalSubscriptionService } from './signal-subscription-service';
import type { TierLabel } from './signal-subscription-service';
import {
  type SignalEvent,
  type PublisherOptions,
  type WebhookHandler,
  DEFAULT_MAX_QUEUE_SIZE,
  DEFAULT_RATE_LIMIT_WINDOW_MS,
  DEFAULT_WEBHOOK_TIMEOUT_MS,
} from './signal-publisher-types';
import {
  canSendSignal,
  recordSignalDelivery,
  buildSignalEvent,
  enqueueSignalEvent,
} from './signal-delivery-limiter';
import { deliverSubscriberWebhook } from './signal-webhook-dispatcher';

export * from './signal-publisher-types';

export class SignalPublisher {
  private subscriptionService: SignalSubscriptionService;
  private queues: Map<string, SignalEvent[]> = new Map();
  private deliveryLog: Map<string, number[]> = new Map();
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
        logger.debug('[SignalPublisher] Rate limited', { subscriberId: sub.id, tier });
        continue;
      }

      for (const signal of result.signals) {
        const event = buildSignalEvent(sub.id, signal, result);
        this.enqueue(sub.id, event);
        this.recordDelivery(sub.id);

        const handler = this.webhookHandlers.get(sub.id);
        if (handler) {
          this.deliverWebhook(sub.id, handler, event);
        }
      }
    }

    if (result.signals.length === 0) {
      const subscribersWithoutSignals = subscribers.filter((s) => s.status === 'active');
      for (const sub of subscribersWithoutSignals) {
        if (!this.canSend(sub.tier, sub.id)) continue;
        const event = buildSignalEvent(sub.id, null, result);
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

  getFeed(subscriberId: string, limit: number = 20): SignalEvent[] {
    const queue = this.queues.get(subscriberId);
    if (!queue) return [];
    return queue.slice(-limit).reverse();
  }

  // ── Webhook Registration ──────────────────────────────────────────────────────

  registerWebhook(subscriberId: string, handler: WebhookHandler): void {
    this.webhookHandlers.set(subscriberId, handler);
    logger.info('[SignalPublisher] Webhook registered', { subscriberId });
  }

  // ── Helpers ───────────────────────────────────────────────────────────────────

  private enqueue(subscriberId: string, event: SignalEvent): void {
    enqueueSignalEvent(this.queues, subscriberId, event, this.maxQueueSize);
  }

  private canSend(tier: TierLabel, subscriberId: string): boolean {
    return canSendSignal(tier, subscriberId, this.rateLimitWindowMs, this.deliveryLog);
  }

  private recordDelivery(subscriberId: string): void {
    recordSignalDelivery(subscriberId, this.deliveryLog);
  }

  private deliverWebhook(
    subscriberId: string,
    handler: WebhookHandler,
    event: SignalEvent,
  ): Promise<void> {
    return deliverSubscriberWebhook(subscriberId, handler, event, this.webhookTimeoutMs);
  }

  // ── Testing / introspection helpers ───────────────────────────────────────────

  clear(): void {
    this.queues.clear();
    this.deliveryLog.clear();
    this.webhookHandlers.clear();
  }

  getQueue(subscriberId: string): SignalEvent[] {
    return this.queues.get(subscriberId) ?? [];
  }
}
