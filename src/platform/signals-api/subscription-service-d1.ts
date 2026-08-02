/**
 * Signal Subscription Service — D1 Backed (Consolidated)
 *
 * Single source of truth for signal subscription management.
 * Replaces 3 separate in-memory implementations.
 *
 * Persistence: D1 via subscriptionRepository.
 */

import { subscriptionRepo } from './subscription-repository-d1';
import { usageMetering } from './usage-metering-service';
import { query } from '../../shared/db/postgres-client.js';
import { logger } from '../../shared/utils/logger';
import type {
  SignalSubscription,
  TierLabel,
  SubscriptionStatus,
  CreateSubscriptionInput,
} from './signal-subscription-service';

// ── Tier config ────────────────────────────────────────────────────────────

export const TIER_RATE_LIMITS: Record<TierLabel, number> = {
  FREE: 2,
  STARTER: 10,
  PRO: 30,
  ENTERPRISE: 120,
  MASTER: -1,
};

export const TIER_SIGNAL_CONFIG = {
  FREE: { delivery: 'daily', rateLimit: 2 },
  STARTER: { delivery: 'hourly', rateLimit: 10 },
  PRO: { delivery: 'hourly', rateLimit: 30 },
  ENTERPRISE: { delivery: 'realtime', rateLimit: 120 },
  MASTER: { delivery: 'realtime', rateLimit: -1 },
} as const;

// ── Service ────────────────────────────────────────────────────────────────

export class SignalSubscriptionServiceD1 {
  /**
   * Create a new subscription.
   * Validates webhook_url if provided.
   * Uses upsert: re-subscribing replaces the previous subscription for this tenant.
   */
  async create(input: CreateSubscriptionInput): Promise<SignalSubscription> {
    if (input.webhookUrl && !this.isValidUrl(input.webhookUrl)) {
      throw new Error(`Invalid webhook URL: ${input.webhookUrl}`);
    }

    // Cancel any existing active subscription for this tenant
    const existing = await subscriptionRepo.getActive();
    for (const sub of existing) {
      if (sub.tenantId === input.tenantId) {
        await subscriptionRepo.cancel(sub.tenantId);
      }
    }

    const id = `sub_${input.tenantId}_${Date.now()}`;
    const expiresAt = input.expiresAt ?? undefined;

    return subscriptionRepo.create({
      id,
      subscriberId: input.tenantId,
      tier: input.tier,
      chatId: undefined, // set separately via updateChatId
      status: 'active',
      expiresAt,
    });
  }

  /** Get a single subscription by id. */
  async get(id: string): Promise<SignalSubscription | undefined> {
    return subscriptionRepo.getById(id);
  }

  /** List subscriptions, optionally filtered by tenantId. */
  async list(tenantId?: string): Promise<SignalSubscription[]> {
    if (tenantId) {
      const sub = await subscriptionRepo.getBySubscriberId(tenantId);
      return sub ? [sub] : [];
    }
    return subscriptionRepo.getActive();
  }

  /** Get active subscriptions for a tenant. */
  async getActiveForTenant(tenantId: string): Promise<SignalSubscription[]> {
    const all = await subscriptionRepo.getActive();
    return all.filter((s) => s.tenantId === tenantId);
  }

  /** Cancel (soft-delete) a subscription by id. */
  async cancel(id: string): Promise<boolean> {
    // Look up tenantId from id
    const sub = await subscriptionRepo.getById(id);
    if (!sub) return false;
    return subscriptionRepo.cancel(sub.tenantId);
  }

  /** Update chat_id on a subscription. */
  async updateChatId(tenantId: string, chatId: number): Promise<SignalSubscription | undefined> {
    await subscriptionRepo.ensureTable();
    await query(
      'UPDATE signal_subscriptions SET chat_id = $1, updated_at = $2 WHERE subscriber_id = $3 AND status = $4',
      [chatId, Date.now(), tenantId, 'active'],
    );
    return subscriptionRepo.getBySubscriberId(tenantId);
  }

  // ── Helpers ────────────────────────────────────────────────────────────

  /** Get the rate limit (signals/minute) for a given tier. */
  getRateLimit(tier: TierLabel): number {
    return TIER_RATE_LIMITS[tier] ?? 0;
  }

  /** Check API call allowance for a subscriber (for rate-limiting middleware). */
  async checkUsage(subscriberId: string, tier: string) {
    return usageMetering.check(subscriberId, tier);
  }

  /** Record an API call for billing. */
  async recordUsage(subscriberId: string, tier: string): Promise<void> {
    await usageMetering.recordCall(subscriberId, tier);
  }

  /** Get usage snapshot for a subscriber (for /status endpoint). */
  async getUsageSnapshot(subscriberId: string) {
    return usageMetering.getSnapshot(subscriberId);
  }

  /** Get tier breakdown counts (for dashboard). */
  async getTierBreakdown(): Promise<Record<string, number>> {
    return usageMetering.getTierBreakdown();
  }

  /** Compute overage charges for a subscriber this period. */
  computeOverage(tier: string, callsThisPeriod: number): number {
    return usageMetering.computeOverage(tier, callsThisPeriod);
  }

  private isValidUrl(url: string): boolean {
    try {
      const u = new URL(url);
      return u.protocol === 'https:' || u.hostname === 'localhost';
    } catch {
      return false;
    }
  }
}

// Singleton
export const signalSubService = new SignalSubscriptionServiceD1();
