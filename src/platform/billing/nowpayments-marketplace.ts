/**
 * NOWPayments Marketplace and Payout Operations
 */

import { logger } from '../../shared/utils/logger';
import type { NowPaymentsStatus } from './nowpayments-types';

/**
 * Generate a marketplace checkout URL by creating a dynamic NOWPayments invoice.
 */
export async function createMarketplaceCheckoutUrl(
  baseUrl: string,
  apiKey: string,
  params: {
    listingId: string;
    strategyName: string;
    priceUsd: number;
    tenantId: string;
    ipnCallbackUrl?: string;
  }
): Promise<{ checkoutUrl: string; paymentId: string } | null> {
  if (!apiKey) {
    logger.error('NOWPAYMENTS_API_KEY not configured');
    return null;
  }

  try {
    const orderId = `mp_${params.listingId}_${params.tenantId.slice(0, 8)}_${Date.now()}`;
    const ipnUrl = params.ipnCallbackUrl ?? process.env.NOWPAYMENTS_IPN_URL ?? '';

    const res = await fetch(`${baseUrl}/invoice`, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
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
export function isMarketplaceOrderId(orderId: string): boolean {
  return orderId.startsWith('mp_');
}

/**
 * Parse marketplace order_id back to listing and tenant info.
 * Format: mp_{listingId}_{tenantIdPrefix}_{timestamp}
 */
export function parseMarketplaceOrderId(orderId: string): { listingId: string; tenantIdPrefix: string } | null {
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
 * Map IPN status to internal action
 */
export function getStatusAction(status: NowPaymentsStatus): 'activate' | 'cancel' | 'ignore' {
  switch (status) {
    case 'finished':
      return 'activate';
    case 'refunded':
    case 'failed':
    case 'expired':
      return 'cancel';
    default:
      return 'ignore';
  }
}

/**
 * Create a payout to a wallet address via NOWPayments API.
 */
export async function createPayout(
  baseUrl: string,
  apiKey: string,
  params: { address: string; amount: number }
): Promise<{ payoutId: string } | null> {
  if (!apiKey) {
    logger.error('NOWPAYMENTS_API_KEY not configured - cannot create payout');
    return null;
  }

  try {
    const res = await fetch(`${baseUrl}/payout`, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        address: params.address,
        amount: params.amount,
        currency: 'usdttrc20',
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      logger.error('NOWPayments payout creation failed', { status: res.status, body });
      return null;
    }

    const payout = (await res.json()) as { id?: string; payout_id?: string };
    logger.info('Payout created', { address: params.address, amount: params.amount, payoutId: payout.id ?? payout.payout_id });
    return { payoutId: payout.id ?? payout.payout_id ?? '' };
  } catch (error) {
    logger.error('Failed to create payout:', { error });
    return null;
  }
}
