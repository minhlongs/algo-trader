/**
 * Coupon Invoice Client
 *
 * NOWPayments invoice creation for coupon-redemption checkout. Extracted so the
 * payment-provider contract (endpoint, payload shape, callback URL) sits in one
 * place and coupon handlers stay on the KV/HTTP layer.
 */

import { CANCEL_URL, SUCCESS_URL } from './coupon-model';

/** NOWPayments IPN callback that credits the redeemed tier. */
const IPN_CALLBACK_URL = 'https://api.cashclaw.cc/api/webhooks/nowpayments';

/** Create a NOWPayments invoice and return its checkout URL, or null on failure. */
export async function createInvoice(
  npApiKey: string,
  orderId: string,
  description: string,
  price: number,
): Promise<string | null> {
  try {
    const res = await fetch('https://api.nowpayments.io/v1/invoice', {
      method: 'POST',
      headers: { 'x-api-key': npApiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        price_amount: price,
        price_currency: 'usd',
        order_id: orderId,
        order_description: description,
        ipn_callback_url: IPN_CALLBACK_URL,
        success_url: SUCCESS_URL,
        cancel_url: CANCEL_URL,
      }),
    });
    const invoice = await res.json() as { id?: string; invoice_url?: string };
    return invoice.invoice_url || (invoice.id ? `https://nowpayments.io/payment?iid=${invoice.id}` : null);
  } catch {
    return null;
  }
}
