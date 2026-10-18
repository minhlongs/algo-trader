/**
 * Tier Activation Signature Verification
 * Cryptographic verification of NOWPayments IPN webhooks.
 */

import crypto from 'node:crypto';
import { logger } from '../shared/utils/logger';
import { sortObjectDeep } from '../platform/workers/nowpayments-utils';
import {
  TierEnum,
  type ActivationResult,
  type NowPaymentsIpnInput,
  type SubscriptionStore,
  type Tier,
  type TierInvalidationCallback,
} from './tier-activation-types';

export function verifyIpnSignature(
  rawBody: string,
  signature: string,
  ipnSecret?: string
): boolean {
  if (!ipnSecret) return false;
  try {
    const sigBuf = Buffer.from(signature.trim(), 'utf8');
    try {
      const sorted = sortObjectDeep(JSON.parse(rawBody));
      const sortedHmac = crypto
        .createHmac('sha512', ipnSecret)
        .update(JSON.stringify(sorted))
        .digest('hex');
      const sortedBuf = Buffer.from(sortedHmac, 'utf8');
      if (
        sortedBuf.length === sigBuf.length &&
        crypto.timingSafeEqual(sortedBuf, sigBuf)
      ) {
        return true;
      }
    } catch {
      // Fallback to raw verification if sorting fails
    }
    const rawHmac = crypto
      .createHmac('sha512', ipnSecret)
      .update(rawBody)
      .digest('hex');
    const rawBuf = Buffer.from(rawHmac, 'utf8');
    return (
      rawBuf.length === sigBuf.length && crypto.timingSafeEqual(rawBuf, sigBuf)
    );
  } catch (err) {
    logger.error('[TierActivationGateway] Signature check error:', { err });
    return false;
  }
}

export function resolveTenantAndTier(payload: NowPaymentsIpnInput): { tenantId: string; tier: Tier } {
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

export async function handleTierDowngrade(
  store: SubscriptionStore,
  tenantId: string,
  currentStatus: string,
  paymentId: string,
  onTierInvalidation?: TierInvalidationCallback,
): Promise<void> {
  const downgradeStatuses = ['refunded', 'failed', 'expired'];
  if (!downgradeStatuses.includes(currentStatus)) return;
  try {
    const existing = await store.getTenant(tenantId);
    if (existing && existing.status === 'ACTIVE') {
      existing.status = currentStatus === 'expired' ? 'EXPIRED' : 'CANCELLED';
      await store.saveTenant(existing);
    }
    if (onTierInvalidation) {
      await onTierInvalidation(tenantId, {
        status: currentStatus,
        paymentId,
        previousTier: existing?.tier,
      });
    }
  } catch (err) {
    logger.error('[TierActivationGateway] Downgrade invalidation error:', { err });
  }
}

export function buildFailureResult(
  tenantId: string,
  tier: Tier,
  paymentId: string,
  error: string,
): ActivationResult {
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

