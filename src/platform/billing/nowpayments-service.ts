/**
 * NOWPayments Crypto Payment Service
 * USDT TRC20 payments via NOWPayments IPN
 *
 * Features:
 * - IPN signature verification (HMAC-SHA512)
 * - Invoice URL generation (pre-created invoices)
 * - Tier-to-invoice mapping
 * - Payment status checking via REST API
 */

import { logger } from '../../shared/utils/logger';
import {
  NOWPAYMENTS_TIERS,
  type NowPaymentsIpnPayload,
  type NowPaymentsStatus,
  type NowPaymentsTierConfig,
} from './nowpayments-types';
import {
  createMarketplaceCheckoutUrl,
  isMarketplaceOrderId,
  parseMarketplaceOrderId,
  getStatusAction,
  createPayout,
} from './nowpayments-marketplace';
import { verifyWebhookSignature, parseCustomerRefFromOrderId } from './nowpayments-webhook-verifier';

export * from './nowpayments-types';
export * from './nowpayments-marketplace';
export { verifyWebhookSignature, parseCustomerRefFromOrderId };

export class NowPaymentsService {
  private static instance: NowPaymentsService;
  private apiKey: string;
  private ipnSecret: string;
  private baseUrl = 'https://api.nowpayments.io/v1';

  private constructor() {
    this.apiKey = process.env.NOWPAYMENTS_API_KEY || '';
    this.ipnSecret = process.env.NOWPAYMENTS_IPN_SECRET || '';

    if (!this.apiKey) {
      logger.warn('NOWPAYMENTS_API_KEY not configured - payment features disabled');
    }
    if (!this.ipnSecret) {
      logger.warn('NOWPAYMENTS_IPN_SECRET not configured - webhook verification disabled');
    }
  }

  static getInstance(): NowPaymentsService {
    if (!NowPaymentsService.instance) {
      NowPaymentsService.instance = new NowPaymentsService();
    }
    return NowPaymentsService.instance;
  }

  /** Verify IPN webhook signature (HMAC-SHA512 over sorted JSON keys with raw fallback) */
  async verifyWebhook(rawBody: string, signature: string): Promise<boolean> {
    return verifyWebhookSignature(rawBody, signature, this.ipnSecret);
  }

  /** Generate checkout URL for a tier (pre-created invoice) */
  createCheckoutUrl(tierKey: string, customerRef: string): string | null {
    const config = NOWPAYMENTS_TIERS[tierKey];
    if (!config || !config.invoiceId) {
      logger.warn(`No invoice configured for tier: ${tierKey}`);
      return null;
    }
    const orderId = `algotrade_${customerRef}_${Date.now()}`;
    return `https://nowpayments.io/payment?iid=${config.invoiceId}&order_id=${orderId}`;
  }

  /** Check payment status via NOWPayments API */
  async getPaymentStatus(paymentId: string): Promise<NowPaymentsIpnPayload | null> {
    if (!this.apiKey) return null;
    try {
      const res = await fetch(`${this.baseUrl}/payment/${paymentId}`, {
        headers: { 'x-api-key': this.apiKey },
      });
      if (!res.ok) {
        logger.error(`NOWPayments API error: ${res.status}`);
        return null;
      }
      return (await res.json()) as NowPaymentsIpnPayload;
    } catch (error) {
      logger.error('Failed to check payment status:', { error });
      return null;
    }
  }

  /** Look up tier by invoice ID from IPN payload */
  getTierByInvoiceId(invoiceId: string): NowPaymentsTierConfig | null {
    return Object.values(NOWPAYMENTS_TIERS).find((t) => t.invoiceId === invoiceId) ?? null;
  }

  /** Parse customer reference from order_id (format: algotrade_{ref}_{timestamp}) */
  parseCustomerRef(orderId: string): string | null {
    return parseCustomerRefFromOrderId(orderId);
  }

  /** Generate a marketplace checkout URL by creating a dynamic NOWPayments invoice. */
  async createMarketplaceCheckoutUrl(params: {
    listingId: string;
    strategyName: string;
    priceUsd: number;
    tenantId: string;
    ipnCallbackUrl?: string;
  }): Promise<{ checkoutUrl: string; paymentId: string } | null> {
    return createMarketplaceCheckoutUrl(this.baseUrl, this.apiKey, params);
  }

  /** Check if an order_id is a marketplace payment (prefix: mp_) */
  isMarketplaceOrderId(orderId: string): boolean {
    return isMarketplaceOrderId(orderId);
  }

  /** Parse marketplace order_id back to listing and tenant info. */
  parseMarketplaceOrderId(orderId: string): { listingId: string; tenantIdPrefix: string } | null {
    return parseMarketplaceOrderId(orderId);
  }

  /** Map IPN status to internal action */
  getStatusAction(status: NowPaymentsStatus): 'activate' | 'cancel' | 'ignore' {
    return getStatusAction(status);
  }

  /** Create a payout to a wallet address via NOWPayments API. */
  async createPayout(params: { address: string; amount: number }): Promise<{ payoutId: string } | null> {
    return createPayout(this.baseUrl, this.apiKey, params);
  }
}
