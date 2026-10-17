/**
 * NOWPayments IPN webhook handler.
 *
 * Flow:
 *   1. Verify HMAC-SHA512 signature
 *   2. Check payment_logs for duplicate invoice_id × status
 *   3. If new → update subscription tier in D1
 *   4. Log full IPN body to payment_logs (audit trail)
 *
 * Endpoint: POST /api/webhooks/nowpayments
 */

import { logger } from '../../../shared/utils/logger';
import {
  type Env,
  type NowPaymentsIPN,
  jsonResponse,
  verifyNowPaymentsSignature,
  processConfirmedPayment,
  mapTierFromInvoice,
} from './webhooks-nowpayments-helpers';

export type { Env, NowPaymentsIPN };
export { verifyNowPaymentsSignature, processConfirmedPayment, mapTierFromInvoice };

export async function handleNowPaymentsIPN(
  request: Request,
  env: Env,
  signingSecret?: string,
): Promise<Response> {
  const sub = env.SUBSCRIBERS;
  const cache = env.CACHE;

  if (!signingSecret) {
    return jsonResponse({ error: 'IPN secret not configured' }, 500);
  }

  // ── Step 1: Verify HMAC signature ──
  const signature = request.headers.get('X-NOWPayments-Sig');
  if (!signature) {
    logger.warn('[nowpayments-ipn] missing signature');
    return jsonResponse({ error: 'Missing signature' }, 401);
  }

  const body = await request.text();
  const isValid = await verifyNowPaymentsSignature(body, signature, signingSecret);
  if (!isValid) {
    return jsonResponse({ error: 'Invalid signature' }, 401);
  }

  // ── Step 2: Parse IPN body ──
  let ipn: NowPaymentsIPN;
  try {
    ipn = JSON.parse(body);
  } catch {
    return jsonResponse({ error: 'Invalid JSON' }, 400);
  }

  const invoiceId = String(ipn.payment_id);
  const status = ipn.payment_status?.toLowerCase();
  logger.info('[nowpayments-ipn] received', { invoiceId, status });

  // ── Step 3: Deduplicate (replay protection) ──
  if (sub) {
    const dedupResult = await sub
      .prepare('SELECT id, status, raw_payload FROM payment_logs WHERE invoice_id = ? AND status = ? LIMIT 1')
      .bind(invoiceId, status)
      .first<{ id: string; status: string }>();

    if (dedupResult) {
      logger.info('[nowpayments-ipn] duplicate suppressed', { invoiceId, status, logId: dedupResult.id });
      return jsonResponse({ received: true, dedup: true, logId: dedupResult.id }, 200);
    }

    // ── Step 4: Log IPN ──
    const logId = await sub
      .prepare(
        `INSERT INTO payment_logs (invoice_id, payment_id, amount, currency, status, raw_payload, verified, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 1, datetime('now'))`,
      )
      .bind(invoiceId, ipn.payment_id, ipn.price_amount, ipn.price_currency, status, body)
      .run();

    // ── Step 5: Process confirmed payments → update tier ──
    if (['confirmed', 'finished'].includes(status)) {
      await processConfirmedPayment(sub, cache, ipn);
    }

    logger.info('[nowpayments-ipn] processed', { invoiceId, status, logId: logId.meta.last_row_id });
  } else {
    // D1 not bound — still return 200 so NOWPayments doesn't retry
    logger.warn('[nowpayments-ipn] D1 not bound, ack only');
    await cache.put(`ipn:${invoiceId}:${status}`, '1', { expirationTtl: 3600 });
  }

  return jsonResponse({ received: true, status }, 200);
}
