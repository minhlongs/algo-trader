/**
 * Signal Subscription Service
 * CRUD for signal subscriptions in the multi-tenant signals API marketplace.
 *
 * Manages subscriber registration, tier assignment, webhook URL validation,
 * and subscription lifecycle (create, read, list, cancel).
 *
 * Tier rate limits (signals/minute):
 *   FREE:  2
 *   STARTER: 10
 *   PRO:     30
 *   ENTERPRISE: 120
 *   MASTER:   unlimited (-1)
 */

import { logger } from '../../shared/utils/logger';

// ── Types ───────────────────────────────────────────────────────────────────────

export interface SignalSubscription {
  id: string;
  tenantId: string;
  tier: TierLabel;
  status: SubscriptionStatus;
  webhookUrl: string | null;
  createdAt: Date;
  expiresAt: Date | null;
}

export type TierLabel = 'FREE' | 'STARTER' | 'PRO' | 'ENTERPRISE' | 'MASTER';
export type SubscriptionStatus = 'active' | 'paused' | 'cancelled' | 'expired';

export interface CreateSubscriptionInput {
  tenantId: string;
  tier: TierLabel;
  webhookUrl?: string;
  expiresAt?: Date;
}

/** Signals-per-minute rate limit per tier. -1 means unlimited. */
export const TIER_RATE_LIMITS: Record<TierLabel, number> = {
  FREE: 2,
  STARTER: 10,
  PRO: 30,
  ENTERPRISE: 120,
  MASTER: -1,
};

// ── Service ─────────────────────────────────────────────────────────────────────

export class SignalSubscriptionService {
  private subscriptions: Map<string, SignalSubscription> = new Map();

  /**
   * Create a new subscription.
   * Validates webhook_url if provided before saving.
   * Throws on invalid webhook URL or duplicate tenant_id.
   */
  create(input: CreateSubscriptionInput): SignalSubscription {
    if (input.webhookUrl && !this.isValidWebhookUrl(input.webhookUrl)) {
      throw new Error(`Invalid webhook URL: ${input.webhookUrl}`);
    }

    // Prevent duplicate subscription per tenant
    const existing = Array.from(this.subscriptions.values()).find(
      (s) => s.tenantId === input.tenantId && s.status === 'active',
    );
    if (existing) {
      throw new Error(`Tenant ${input.tenantId} already has an active subscription`);
    }

    const now = new Date();
    const subscription: SignalSubscription = {
      id: crypto.randomUUID(),
      tenantId: input.tenantId,
      tier: input.tier,
      status: 'active',
      webhookUrl: input.webhookUrl ?? null,
      createdAt: now,
      expiresAt: input.expiresAt ?? null,
    };

    this.subscriptions.set(subscription.id, subscription);
    logger.info('[SignalSubService] Created subscription', {
      id: subscription.id,
      tenantId: input.tenantId,
      tier: input.tier,
    });

    return subscription;
  }

  /** Get a single subscription by id. Returns undefined if not found. */
  get(id: string): SignalSubscription | undefined {
    return this.subscriptions.get(id);
  }

  /** List subscriptions, optionally filtered by tenant_id. */
  list(tenantId?: string): SignalSubscription[] {
    const all = Array.from(this.subscriptions.values());
    if (tenantId) {
      return all.filter((s) => s.tenantId === tenantId);
    }
    return all;
  }

  /**
   * Cancel (soft-delete) a subscription.
   * Sets status to 'cancelled'. Returns false if not found.
   */
  cancel(id: string): boolean {
    const sub = this.subscriptions.get(id);
    if (!sub) return false;

    sub.status = 'cancelled';
    logger.info('[SignalSubService] Cancelled subscription', { id, tenantId: sub.tenantId });
    return true;
  }

  // ── URL validation ────────────────────────────────────────────────────────────

  /**
   * Basic webhook URL validation:
   * - Must be a valid URL
   * - Must use https protocol (except localhost for testing)
   * - Must have a hostname
   */
  private isValidWebhookUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') {
        return parsed.protocol === 'http:' || parsed.protocol === 'https:';
      }
      return parsed.protocol === 'https:';
    } catch {
      return false;
    }
  }

  // ── Helpers for internal use ──────────────────────────────────────────────────

  /** Get the rate limit (signals/minute) for a given tier. */
  getRateLimit(tier: TierLabel): number {
    return TIER_RATE_LIMITS[tier] ?? 0;
  }

  /** Find active subscriptions for a tenant. */
  getActiveForTenant(tenantId: string): SignalSubscription[] {
    return Array.from(this.subscriptions.values()).filter(
      (s) => s.tenantId === tenantId && s.status === 'active',
    );
  }
}
