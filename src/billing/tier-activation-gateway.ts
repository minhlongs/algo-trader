/**
 * Tier Activation Gateway
 * Verifies NOWPayments IPN webhooks, provisions subscriber tiers, and enforces idempotency.
 */

import { logger } from '../shared/utils/logger';
import {
  NowPaymentsIpnSchema,
  TIER_ENTITLEMENTS,
  type ActivationResult,
  type NowPaymentsIpnInput,
  type SubscriptionStore,
  type Tier,
  type TierActivationGatewayConfig,
  type TierEntitlements,
  type TierInvalidationCallback,
} from './tier-activation-types';
import { InMemorySubscriptionStore } from './tier-activation-store';
import {
  verifyIpnSignature,
  resolveTenantAndTier,
  handleTierDowngrade,
  buildFailureResult,
} from './tier-activation-signature';

export { InMemorySubscriptionStore, verifyIpnSignature, resolveTenantAndTier };

export class TierActivationGateway {
  private ipnSecret?: string;
  private store: SubscriptionStore;
  private onTierInvalidation?: TierInvalidationCallback;

  constructor(config?: TierActivationGatewayConfig) {
    this.ipnSecret = config?.ipnSecret ?? process.env.NOWPAYMENTS_IPN_SECRET;
    this.store = config?.store ?? new InMemorySubscriptionStore();
    this.onTierInvalidation = config?.onTierInvalidation;
  }

  verifySignature(rawBody: string, signature: string): boolean {
    return verifyIpnSignature(rawBody, signature, this.ipnSecret);
  }

  resolveTenantAndTier(payload: NowPaymentsIpnInput): { tenantId: string; tier: Tier } {
    return resolveTenantAndTier(payload);
  }

  async processWebhook(rawBody: string, signature?: string): Promise<ActivationResult> {
    if (this.ipnSecret && (!signature || !this.verifySignature(rawBody, signature))) {
      return this.failureResult('unknown', 'BASIC', '', 'Invalid or missing webhook signature');
    }
    try {
      return await this.processPayload(JSON.parse(rawBody));
    } catch {
      return this.failureResult('unknown', 'BASIC', '', 'Malformed JSON webhook payload');
    }
  }

  async processPayload(input: unknown): Promise<ActivationResult> {
    const parseResult = NowPaymentsIpnSchema.safeParse(input);
    if (!parseResult.success) {
      return this.failureResult('unknown', 'BASIC', '', `Validation failed: ${parseResult.error.message}`);
    }

    const payload = parseResult.data;
    const { tenantId, tier } = this.resolveTenantAndTier(payload);
    const validStatuses = ['confirmed', 'finished'];
    const currentStatus = payload.payment_status.toLowerCase();

    if (!validStatuses.includes(currentStatus)) {
      await handleTierDowngrade(this.store, tenantId, currentStatus, payload.payment_id, this.onTierInvalidation);
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
    return buildFailureResult(tenantId, tier, paymentId, error);
  }
}

