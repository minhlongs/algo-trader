/**
 * NOWPayments IPN Webhook Helpers & Types
 */

import {
  sortObjectDeep,
  constantTimeEqual,
  normalizePaymentStatus,
  compactObject,
} from './nowpayments-utils';

export interface IpnPayload {
  payment_id: string | number;
  payment_status: string;
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

export interface Env {
  CACHE: KVNamespace;
  NOWPAYMENTS_IPN_SECRET?: string;
}

export const CORS = {
  'Access-Control-Allow-Origin': 'https://cashclaw.cc',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-NOWPayments-Sig',
  'Content-Type': 'application/json',
};

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: CORS });
}

/**
 * Verify NOWPayments IPN signature.
 * Algorithm (matches SDK ipn.js):
 *   1. Parse JSON → deep sort object keys recursively
 *   2. JSON.stringify(sorted) (no spaces)
 *   3. HMAC-SHA512(secret, sortedStr)
 *   4. Constant-time hex compare
 */
export async function verifyIpnSignature(
  rawBody: string,
  signature: string,
  secret: string,
): Promise<boolean> {
  try {
    const parsed = JSON.parse(rawBody);
    const sorted = sortObjectDeep(parsed);
    const sortedStr = JSON.stringify(sorted);

    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret.trim()),
      { name: 'HMAC', hash: 'SHA-512' },
      false,
      ['sign'],
    );

    const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(sortedStr));
    const computed = Array.from(new Uint8Array(sig))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    return constantTimeEqual(computed, signature.trim());
  } catch {
    return false;
  }
}

/** Extract email from order_description for activation lookup */
export function extractEmail(ipn: IpnPayload): string {
  const desc = ipn.order_description || ipn.order_id || '';
  const match = desc.match(/[\w.-]+@[\w.-]+\.[a-zA-Z]{2,}/);
  return match ? match[0] : (ipn.order_id || 'unknown');
}

/** Guess tier from price_amount */
export function guessTier(amount: number): string {
  if (amount >= 400) return 'ELITE';
  if (amount >= 100) return 'PRO';
  return 'STARTER';
}

/**
 * Normalize webhook payload (matches SDK ipn.js normalizeWebhook).
 * Detects payment status change events.
 */
export function normalizeWebhook(payload: Record<string, unknown>) {
  if ('payment_id' in payload || 'payment_status' in payload) {
    return {
      type: 'payment.status_changed',
      payment: compactObject({
        paymentId: String(payload.payment_id || ''),
        status: normalizePaymentStatus(String(payload.payment_status || '')),
        amount: Number(payload.price_amount) || 0,
        currency: String(payload.price_currency || ''),
        orderId: payload.order_id ? String(payload.order_id) : undefined,
        email: payload.order_description ? String(payload.order_description) : undefined,
        invoiceId: payload.invoice_id ? String(payload.invoice_id) : undefined,
      }),
    };
  }
  return { type: 'unknown', data: null };
}
