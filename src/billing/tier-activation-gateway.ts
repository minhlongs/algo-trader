/**
 * Tier Activation Gateway
 * Verifies NOWPayments IPN webhooks, provisions subscriber tiers, and enforces idempotency.
 */

import crypto from 'node:crypto';
import { logger } from '../shared/utils/logger';
import {
  NowPaymentsIpnSchema,
  TIER_ENTITLEMENTS,
  TierEnum,
  type ActivationResult,
  type NowPaymentsIpnInput,
  type SubscriptionStore,
  type TenantSubscriptionRecord,
  type Tier,
  type TierEntitlements,
} from './tier-activation-types';

export class InMemorySubscriptionStore implements SubscriptionStore {
  private tenants = new Map<string, TenantSubscriptionRecord>();
  private processed = new Set<string>();

  async getTenant(tenantId: string): Promise<TenantSubscriptionRecord | null> {
    return this.tenants.get(tenantId) ?? null;
  }

  async saveTenant(record: TenantSubscriptionRecord): Promise<void> {
    this.tenants.set(record.tenantId, { ...record });
    record.processedPayments.forEach((p) => this.processed.add(p));
  }

  async isPaymentProcessed(paymentId: string): Promise<boolean> {
    return this.processed.has(paymentId);
  }
}

export class TierActivationGateway {
  private ipnSecret?: string;
  private store: SubscriptionStore;

  constructor(config?: { ipnSecret?: string; store?: SubscriptionStore }) {
    this.ipnSecret = config?.ipnSecret ?? process.env.NOWPAYMENTS_IPN_SECRET;
    this.store = config?.store ?? new InMemorySubscriptionStore();
  }

  verifySignature(rawBody: string, signature: string): boolean {
    if (!this.ipnSecret) return false;
    try {
      const computed = crypto.createHmac('sha512', this.ipnSecret).update(rawBody).digest('hex');
      const compBuf = Buffer.from(computed, 'utf8');
      const sigBuf = Buffer.from(signature, 'utf8');
      return compBuf.length === sigBuf.length && crypto.timingSafeEqual(compBuf, sigBuf);
    } catch (err) {
      logger.error('[TierActivationGateway] Signature check error:', { err });
      return false;
    }
  }

  resolveTenantAndTier(payload: NowPaymentsIpnInput): { tenantId: string; tier: Tier } {
    const rawOrder = payload.order_id ?? '';
    const desc = payload.order_description ?? '';

    if (rawOrder.includes(':')) {
      const parts = rawOrder.split(':');
      const parsed = TierEnum.safeParse(parts[1]?.trim().toUpperCase());
      if (parsed.success) return { tenantId: parts[0] || 'default-tenant', tier: parsed.data };
    }

    const matches = (rawOrder + ' ' + desc).toUpperCase().match(/\b(MASTER|ENTERPRISE|PREMIUM|BASIC)\b/);
    if (matches?.[1]) {
      const parsed = TierEnum.safeParse(matches[1]);
      if (parsed.success) return { tenantId: rawOrder.split(':')[0] || 'default-tenant', tier: parsed.data };
    }

    return { tenantId: rawOrder || 'default-tenant', tier: 'BASIC' };
  }

  async processWebhook(rawBody: string, signature?: string): Promise<ActivationResult> {
    if (this.ipnSecret && (!signature || !this.verifySignature(rawBody, signature))) {
      return this.failureResult('unknown', 'BASIC', '', 'Invalid or missing webhook signature');
    }

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(rawBody);
    } catch {
      return this.failureResult('unknown', 'BASIC', '', 'Malformed JSON webhook payload');
    }
    return this.processPayload(parsedJson);
  }

  async processPayload(input: unknown): Promise<ActivationResult> {
    const parseResult = NowPaymentsIpnSchema.safeParse(input);
    if (!parseResult.success) {
      return this.failureResult('unknown', 'BASIC', '', `Validation failed: ${parseResult.error.message}`);
    }

    const payload = parseResult.data;
    const { tenantId, tier } = this.resolveTenantAndTier(payload);
    const validStatuses = ['confirmed', 'finished'];

    if (!validStatuses.includes(payload.payment_status.toLowerCase())) {
      return this.failureResult(tenantId, tier, payload.payment_id, `Payment status '${payload.payment_status}' is not confirmed`);
    }

    try {
      const alreadyProcessed = await this.store.isPaymentProcessed(payload.payment_id);
      const existing = await this.store.getTenant(tenantId);

      if (alreadyProcessed || existing?.processedPayments.includes(payload.payment_id)) {
        return {
          success: true,
          tenantId,
          tier: existing?.tier ?? tier,
          paymentId: payload.payment_id,
          strategyQuotaProvisioned: existing?.strategyQuota ?? TIER_ENTITLEMENTS[tier].strategyQuota,
          isDuplicate: true,
          activatedAt: existing?.activatedAt ?? new Date().toISOString(),
        };
      }

      const entitlements = TIER_ENTITLEMENTS[tier];
      const activatedAt = new Date().toISOString();
      await this.store.saveTenant({
        tenantId,
        tier,
        strategyQuota: entitlements.strategyQuota,
        paymentId: payload.payment_id,
        activatedAt,
        status: 'ACTIVE',
        processedPayments: [...(existing?.processedPayments ?? []), payload.payment_id],
      });
      logger.info(`[TierActivationGateway] Activated tier ${tier} for tenant ${tenantId}`);

      return {
        success: true,
        tenantId,
        tier,
        paymentId: payload.payment_id,
        strategyQuotaProvisioned: entitlements.strategyQuota,
        isDuplicate: false,
        activatedAt,
      };
    } catch (error) {
      logger.error('[TierActivationGateway] Tier provisioning error:', { error });
      return this.failureResult(tenantId, tier, payload.payment_id, 'Failed to persist tenant record');
    }
  }

  async getTenantEntitlements(tenantId: string): Promise<TierEntitlements | null> {
    const record = await this.store.getTenant(tenantId);
    return record && record.status === 'ACTIVE' ? TIER_ENTITLEMENTS[record.tier] ?? null : null;
  }

  private failureResult(tenantId: string, tier: Tier, paymentId: string, error: string): ActivationResult {
    return {
      success: false,
      tenantId,
      tier,
      paymentId,
      strategyQuotaProvisioned: 0,
      isDuplicate: false,
      activatedAt: new Date().toISOString(),
      error,
    };
  }
}
