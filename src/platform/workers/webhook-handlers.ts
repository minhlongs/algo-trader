/**
 * NOWPayments IPN Webhook Handler — CF-native, zero VPS.
 * Ported from official SDK patterns (ipn.js + normalizers.js).
 * Deep-sorts payload keys, constant-time HMAC compare, payment status normalization.
 */

import {
  sortObjectDeep, constantTimeEqual, normalizePaymentStatus, isTerminalStatus,
  configError, validationError, compactObject,
} from './nowpayments-utils';

// Reuse shared types from coupon-handlers pattern
interface IpnPayload {
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

interface Env {
  CACHE: KVNamespace;
  NOWPAYMENTS_IPN_SECRET?: string;
}

const CORS = {
  'Access-Control-Allow-Origin': 'https://cashclaw.cc',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-NOWPayments-Sig',
  'Content-Type': 'application/json',
};

function json(data: unknown, status = 200): Response {
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
async function verifyIpnSignature(rawBody: string, signature: string, secret: string): Promise<boolean> {
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
function extractEmail(ipn: IpnPayload): string {
  const desc = ipn.order_description || ipn.order_id || '';
  const match = desc.match(/[\w.-]+@[\w.-]+\.[a-zA-Z]{2,}/);
  return match ? match[0] : (ipn.order_id || 'unknown');
}

/** Guess tier from price_amount */
function guessTier(amount: number): string {
  if (amount >= 400) return 'ELITE';
  if (amount >= 100) return 'PRO';
  return 'STARTER';
}

/**
 * Normalize webhook payload (matches SDK ipn.js normalizeWebhook).
 * Detects payment status change events.
 */
function normalizeWebhook(payload: Record<string, unknown>) {
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

/**
 * POST /api/webhooks/nowpayments
 * Verifies HMAC-SHA512 signature, normalizes payment status, stores activation in KV.
 */
export async function handleNowPaymentsIpn(request: Request, env: Env): Promise<Response> {
  const signature = request.headers.get('x-nowpayments-sig');
  if (!signature) {
    return json(validationError('Missing x-nowpayments-sig header', 'MISSING_SIGNATURE'), 400);
  }

  const rawBody = await request.text();
  if (!rawBody) {
    return json(validationError('Empty body', 'EMPTY_BODY'), 400);
  }

  // Verify signature
  if (!env.NOWPAYMENTS_IPN_SECRET) {
    return json(configError('IPN secret not configured', 'MISSING_IPN_SECRET'), 500);
  }
  const valid = await verifyIpnSignature(rawBody, signature, env.NOWPAYMENTS_IPN_SECRET);
  if (!valid) {
    return json(validationError('Invalid IPN signature', 'INVALID_SIGNATURE'), 401);
  }

  let raw: Record<string, unknown>;
  try { raw = JSON.parse(rawBody); } catch {
    return json(validationError('Invalid JSON body', 'INVALID_JSON'), 400);
  }

  const webhook = normalizeWebhook(raw);
  const ipn = raw as unknown as IpnPayload;
  ipn.payment_id = String(ipn.payment_id);
  const normalizedStatus = normalizePaymentStatus(ipn.payment_status);
  const timestamp = new Date().toISOString();

  // Log every IPN to KV
  const logEntry = {
    payment_id: ipn.payment_id,
    apiStatus: ipn.payment_status,
    normalizedStatus,
    isTerminal: isTerminalStatus(ipn.payment_status),
    amount: ipn.price_amount,
    currency: ipn.price_currency,
    type: webhook.type,
    timestamp,
  };
  await env.CACHE.put(`ipn-log:${timestamp}-${ipn.payment_id}`, JSON.stringify(logEntry));

  // Increment counters
  const totalStr = await env.CACHE.get('metric:ipn-total');
  const total = (parseInt(totalStr || '0', 10) || 0) + 1;
  await env.CACHE.put('metric:ipn-total', String(total));

  if (normalizedStatus === 'paid') {
    const email = extractEmail(ipn);
    const tier = guessTier(ipn.price_amount);

    // Idempotent activation
    const existing = await env.CACHE.get(`activation:payment:${ipn.payment_id}`);
    if (!existing) {
      const activation = {
        email, tier,
        paymentId: ipn.payment_id,
        amount: ipn.price_amount,
        currency: ipn.price_currency,
        status: normalizedStatus,
        activatedAt: timestamp,
      };
      await env.CACHE.put(`activation:payment:${ipn.payment_id}`, JSON.stringify(activation));
      await env.CACHE.put(`activation:user:${email}`, JSON.stringify(activation));
      await env.CACHE.put('metric:ipn-last-success', JSON.stringify({ payment_id: ipn.payment_id, timestamp }));
    }
  } else if (['failed', 'refunded', 'expired', 'cancelled'].includes(normalizedStatus)) {
    await env.CACHE.put('metric:ipn-last-failure', JSON.stringify({
      payment_id: ipn.payment_id,
      apiStatus: ipn.payment_status,
      normalizedStatus,
      timestamp,
    }));

    const failedStr = await env.CACHE.get('metric:ipn-failed');
    const failed = (parseInt(failedStr || '0', 10) || 0) + 1;
    await env.CACHE.put('metric:ipn-failed', String(failed));
  }

  return json({ received: true, type: webhook.type, status: normalizedStatus });
}
