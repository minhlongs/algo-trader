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
import { LicenseTier } from '../../shared/types/license';

// NOWPayments IPN payload from webhook
export interface NowPaymentsIpnPayload {
  payment_id: string;
  payment_status: NowPaymentsStatus;
  pay_address?: string;
  price_amount: number;
  price_currency: string;
  pay_amount?: number;
  pay_currency?: string;
  order_id?: string;
  order_description?: string;
  invoice_id?: string;
  actually_paid?: number;
  outcome_amount?: number;
  outcome_currency?: string;
}

export type NowPaymentsStatus =
  | 'waiting'
  | 'confirming'
  | 'confirmed'
  | 'sending'
  | 'partially_paid'
  | 'finished'
  | 'failed'
  | 'refunded'
  | 'expired';

// Tier configuration with pre-created invoice IDs from NOWPayments dashboard
export interface NowPaymentsTierConfig {
  tier: LicenseTier;
  invoiceId: string;
  price: number;
  currency: string;
  name: string;
}

// Configure invoice IDs from NOWPayments dashboard (customers set these in .env or config)
export const NOWPAYMENTS_TIERS: Record<string, NowPaymentsTierConfig> = {
  STARTER: {
    tier: LicenseTier.STARTER,
    invoiceId: process.env.NOWPAYMENTS_INVOICE_STARTER || '',
    price: 19,
    currency: 'USD',
    name: 'Starter',
  },
  PRO: {
    tier: LicenseTier.PRO,
    invoiceId: process.env.NOWPAYMENTS_INVOICE_PRO || '',
    price: 99,
    currency: 'USD',
    name: 'Pro Trader',
  },
  ENTERPRISE: {
    tier: LicenseTier.ENTERPRISE,
    invoiceId: process.env.NOWPAYMENTS_INVOICE_ENTERPRISE || '',
    price: 299,
    currency: 'USD',
    name: 'Enterprise',
  },
  MASTER: {
    tier: LicenseTier.MASTER,
    invoiceId: process.env.NOWPAYMENTS_INVOICE_MASTER || '',
    price: 999,
    currency: 'USD',
    name: 'Master Trader',
  },
};

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

  /**
   * Verify IPN webhook signature (HMAC-SHA512 over sorted JSON keys)
   */
  async verifyWebhook(rawBody: string, signature: string): Promise<boolean> {
    if (!this.ipnSecret) {
      logger.warn('NOWPAYMENTS_IPN_SECRET not configured');
      return false;
    }

    try {
      const parsed = JSON.parse(rawBody) as Record<string, unknown>;
      const sortedKeys = Object.keys(parsed).sort();
      const sorted = JSON.stringify(parsed, sortedKeys);

      const encoder = new TextEncoder();
      const key = await crypto.subtle.importKey(
        'raw',
        encoder.encode(this.ipnSecret),
        { name: 'HMAC', hash: 'SHA-512' },
        false,
        ['sign']
      );

      const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(sorted));
      const computed = Array.from(new Uint8Array(sig))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');

      return computed === signature;
    } catch (error) {
      logger.error('IPN signature verification failed:', { error });
      return false;
    }
  }

  /**
   * Generate checkout URL for a tier (pre-created invoice)
   */
  createCheckoutUrl(tierKey: string, customerRef: string): string | null {
    const config = NOWPAYMENTS_TIERS[tierKey];
    if (!config || !config.invoiceId) {
      logger.warn(`No invoice configured for tier: ${tierKey}`);
      return null;
    }

    const orderId = `algotrade_${customerRef}_${Date.now()}`;
    return `https://nowpayments.io/payment?iid=${config.invoiceId}&order_id=${orderId}`;
  }

  /**
   * Check payment status via NOWPayments API
   */
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

  /**
   * Look up tier by invoice ID from IPN payload
   */
  getTierByInvoiceId(invoiceId: string): NowPaymentsTierConfig | null {
    return (
      Object.values(NOWPAYMENTS_TIERS).find((t) => t.invoiceId === invoiceId) ?? null
    );
  }

  /**
   * Parse customer reference from order_id (format: algotrade_{ref}_{timestamp})
   */
  parseCustomerRef(orderId: string): string | null {
    const parts = orderId.split('_');
    if (parts.length >= 3 && parts[0] === 'algotrade') {
      return parts.slice(1, -1).join('_');
    }
    return null;
  }

  /**
   * Generate a marketplace checkout URL by creating a dynamic NOWPayments invoice.
   * Returns { checkoutUrl, paymentId } or null on failure.
   */
  async createMarketplaceCheckoutUrl(params: {
    listingId: string;
    strategyName: string;
    priceUsd: number;
    tenantId: string;
    ipnCallbackUrl?: string;
  }): Promise<{ checkoutUrl: string; paymentId: string } | null> {
    if (!this.apiKey) {
      logger.error('NOWPAYMENTS_API_KEY not configured');
      return null;
    }

    try {
      const orderId = `mp_${params.listingId}_${params.tenantId.slice(0, 8)}_${Date.now()}`;
      const ipnUrl = params.ipnCallbackUrl ?? process.env.NOWPAYMENTS_IPN_URL ?? '';

      const res = await fetch(`${this.baseUrl}/invoice`, {
        method: 'POST',
        headers: {
          'x-api-key': this.apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          price_amount: params.priceUsd,
          price_currency: 'usd',
          pay_currency: 'usdttrc20',
          order_id: orderId,
          order_description: `AlgoTrader: ${params.strategyName}`,
          ipn_callback_url: ipnUrl,
        }),
      });

      if (!res.ok) {
        const body = await res.text();
        logger.error('NOWPayments invoice creation failed', { status: res.status, body });
        return null;
      }

      const invoice = (await res.json()) as {
        id: string;
        invoice_url: string;
        payment_id?: string;
      };

      logger.info('Marketplace invoice created', {
        invoiceId: invoice.id,
        listingId: params.listingId,
        tenantId: params.tenantId,
      });

      return {
        checkoutUrl: invoice.invoice_url,
        paymentId: invoice.payment_id ?? invoice.id,
      };
    } catch (error) {
      logger.error('Failed to create marketplace checkout URL', { error });
      return null;
    }
  }

  /**
   * Check if an order_id is a marketplace payment (prefix: mp_)
   */
  isMarketplaceOrderId(orderId: string): boolean {
    return orderId.startsWith('mp_');
  }

  /**
   * Parse marketplace order_id back to listing and tenant info.
   * Format: mp_{listingId}_{tenantIdPrefix}_{timestamp}
   */
  parseMarketplaceOrderId(orderId: string): { listingId: string; tenantIdPrefix: string } | null {
    const parts = orderId.split('_');
    if (parts.length >= 4 && parts[0] === 'mp') {
      return {
        listingId: parts[1],
        tenantIdPrefix: parts[2],
      };
    }
    return null;
  }

  /**
   * Create a payout (USDT TRC20) to a creator wallet via NOWPayments Payout API.
   * Used by the marketplace payout scheduler to send actual crypto.
   */
  async createPayout(params: {
    address: string;
    amount: number; // in USD
    currency?: string;
    ipnCallbackUrl?: string;
  }): Promise<{ payoutId: string } | null> {
    if (!this.apiKey) {
      logger.error('NOWPAYMENTS_API_KEY not configured — cannot send payout');
      return null;
    }

    try {
      const ipnUrl = params.ipnCallbackUrl ?? process.env.NOWPAYMENTS_IPN_URL ?? '';
      const currency = params.currency ?? 'usdttrc20';

      const res = await fetch(`${this.baseUrl}/payout`, {
        method: 'POST',
        headers: {
          'x-api-key': this.apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          address: params.address,
          currency,
          amount: params.amount,
          ipn_callback_url: ipnUrl,
        }),
      });

      if (!res.ok) {
        const body = await res.text();
        logger.error('NOWPayments payout creation failed', { status: res.status, body });
        return null;
      }

      const payout = (await res.json()) as { id?: string; payout_id?: string; status?: string };
      const payoutId = payout.id ?? payout.payout_id ?? 'unknown';

      logger.info('NOWPayments payout created', {
        payoutId,
        address: params.address,
        amount: params.amount,
        currency,
      });

      return { payoutId };
    } catch (error) {
      logger.error('Failed to create NOWPayments payout', { error });
      return null;
    }
  }

  /**
   * Map IPN status to internal action
   */
  getStatusAction(status: NowPaymentsStatus): 'activate' | 'cancel' | 'ignore' {
    switch (status) {
      case 'finished':
        return 'activate';
      case 'refunded':
        return 'cancel';
      case 'failed':
      case 'expired':
        return 'cancel';
      default:
        return 'ignore';
    }
  }
}
