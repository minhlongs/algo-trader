// SPDX-License-Identifier: MIT
/**
 * Step 20: Unified Crypto & Fiat IPN Webhook Handler
 * Supports NOWPayments (USDT/Crypto HMAC-SHA512) and PayOS (Vietnamese QR bank transfer HMAC-SHA256).
 * Strictly rejects Polar per Sophia Handover Rules.
 *
 * @module billing/ipn-webhook
 */

import crypto from 'node:crypto';
import { z } from 'zod';
import { logger } from '../shared/utils/logger';
import { TierEnum, type ActivationResult, type Tier } from './tier-activation-types';
import { TierActivationGateway, InMemorySubscriptionStore } from './tier-activation-gateway';

export const PayOSWebhookPayloadSchema = z.object({
  code: z.string(),
  desc: z.string(),
  data: z.object({
    orderCode: z.number(),
    amount: z.number().positive(),
    description: z.string(),
    accountNumber: z.string().optional(),
    reference: z.string().optional(),
    transactionDateTime: z.string().optional(),
    currency: z.string().default('VND'),
    paymentLinkId: z.string().optional(),
  }),
  signature: z.string(),
});

export type PayOSWebhookPayload = z.infer<typeof PayOSWebhookPayloadSchema>;

export interface UnifiedIpnHandlerConfig {
  readonly nowpaymentsSecret?: string;
  readonly payosChecksumKey?: string;
  readonly gateway?: TierActivationGateway;
}

export class UnifiedIpnWebhookHandler {
  private readonly gateway: TierActivationGateway;
  private readonly payosChecksumKey?: string;

  constructor(config?: UnifiedIpnHandlerConfig) {
    this.gateway =
      config?.gateway ??
      new TierActivationGateway({
        ipnSecret: config?.nowpaymentsSecret ?? process.env.NOWPAYMENTS_IPN_SECRET,
        store: new InMemorySubscriptionStore(),
      });
    this.payosChecksumKey = config?.payosChecksumKey ?? process.env.PAYOS_CHECKSUM_KEY;
  }

  public async handleNowPayments(rawBody: string, signature?: string): Promise<ActivationResult> {
    return this.gateway.processWebhook(rawBody, signature);
  }

  public verifyPayOSSignature(data: PayOSWebhookPayload['data'], signature: string): boolean {
    if (!this.payosChecksumKey) return false;
    const sortedKeys = Object.keys(data).sort();
    const signString = sortedKeys
      .map((key) => `${key}=${String(data[key as keyof typeof data] ?? '')}`)
      .join('&');
    const computed = crypto.createHmac('sha256', this.payosChecksumKey).update(signString).digest('hex');
    const compBuf = Buffer.from(computed, 'utf8');
    const sigBuf = Buffer.from(signature.trim(), 'utf8');
    return compBuf.length === sigBuf.length && crypto.timingSafeEqual(compBuf, sigBuf);
  }

  public async handlePayOS(payload: unknown): Promise<ActivationResult> {
    const parse = PayOSWebhookPayloadSchema.safeParse(payload);
    if (!parse.success) {
      return {
        success: false,
        tenantId: 'unknown',
        tier: 'BASIC',
        paymentId: '',
        strategyQuotaProvisioned: 0,
        isDuplicate: false,
        activatedAt: new Date().toISOString(),
        error: `PayOS validation failed: ${parse.error.message}`,
      };
    }
    const { data, signature, code } = parse.data;
    if (this.payosChecksumKey && !this.verifyPayOSSignature(data, signature)) {
      return {
        success: false,
        tenantId: 'unknown',
        tier: 'BASIC',
        paymentId: String(data.orderCode),
        strategyQuotaProvisioned: 0,
        isDuplicate: false,
        activatedAt: new Date().toISOString(),
        error: 'Invalid PayOS HMAC signature',
      };
    }
    if (code !== '00') {
      return {
        success: false,
        tenantId: 'unknown',
        tier: 'BASIC',
        paymentId: String(data.orderCode),
        strategyQuotaProvisioned: 0,
        isDuplicate: false,
        activatedAt: new Date().toISOString(),
        error: `PayOS status unsuccessful: ${code}`,
      };
    }
    const tierMatch = data.description.toUpperCase().match(/\b(MASTER|ENTERPRISE|PREMIUM|BASIC)\b/);
    const parsedTier = tierMatch ? TierEnum.safeParse(tierMatch[1]) : null;
    const tier: Tier = parsedTier && parsedTier.success ? parsedTier.data : 'BASIC';
    const tenantId = data.description.split(/[:\s]/)[0] || `tenant-${data.orderCode}`;

    const syntheticIpn = {
      payment_id: String(data.orderCode),
      payment_status: 'finished',
      price_amount: data.amount,
      price_currency: data.currency,
      order_id: `${tenantId}:${tier}`,
      order_description: data.description,
    };
    logger.info(`[UnifiedIpn] Processing PayOS payment ${data.orderCode} for tenant ${tenantId} (${tier})`);
    return this.gateway.processPayload(syntheticIpn);
  }

  public handlePolarWebhook(): never {
    throw new Error('Polar is strictly forbidden in Sophia AI Factory per handover rules');
  }
}
