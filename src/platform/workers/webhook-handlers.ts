/**
 * NOWPayments IPN Webhook Handler — CF-native, zero VPS.
 * Ported from official SDK patterns (ipn.js + normalizers.js).
 * Deep-sorts payload keys, constant-time HMAC compare, payment status normalization.
 */

import {
  normalizePaymentStatus,
  isTerminalStatus,
  configError,
  validationError,
} from './nowpayments-utils';
import {
  CORS,
  json,
  verifyIpnSignature,
  extractEmail,
  guessTier,
  normalizeWebhook,
  type IpnPayload,
  type Env,
} from './webhook-ipn-helpers';

export type { IpnPayload, Env } from './webhook-ipn-helpers';
export { CORS, json, verifyIpnSignature, extractEmail, guessTier, normalizeWebhook } from './webhook-ipn-helpers';

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
  try {
    raw = JSON.parse(rawBody);
  } catch {
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
        email,
        tier,
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
    await env.CACHE.put(
      'metric:ipn-last-failure',
      JSON.stringify({
        payment_id: ipn.payment_id,
        apiStatus: ipn.payment_status,
        normalizedStatus,
        timestamp,
      }),
    );

    const failedStr = await env.CACHE.get('metric:ipn-failed');
    const failed = (parseInt(failedStr || '0', 10) || 0) + 1;
    await env.CACHE.put('metric:ipn-failed', String(failed));
  }

  return json({ received: true, type: webhook.type, status: normalizedStatus });
}
