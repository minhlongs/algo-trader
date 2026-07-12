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

import { logger } from '../../../desk/utils/logger';
import type { D1Database, KVNamespace } from '@cloudflare/workers-types';

type Env = { CACHE: KVNamespace; SUBSCRIBERS?: D1Database; JWT_SECRET?: string; ALLOWED_ORIGINS?: string; NOWPAYMENTS_IPN_SECRET?: string; ENVIRONMENT?: string; VPS_ORIGIN?: string; REGION_ROUTING_ENABLED?: string; };

interface NowPaymentsIPN {
  payment_id: number;
  payment_status: string; // waiting, confirming, confirmed, sending, finished, failed, refunded, expired
  pay_address: string;
  price_amount: number;
  price_currency: string;
  pay_amount: number;
  amount_received: number;
  payin_extra_id?: string;
  payin_hash?: string;
  order_id?: string;
  order_description?: string;
  purchase_id?: string;
  outcome_amount?: number;
  outcome_currency?: string;
  created_at: string;
  updated_at: string;
  // HMAC signature in header: X-NOWPayments-Sig
}

export async function handleNowPaymentsIPN(request: Request, env: any, signingSecret?: string): Promise<Response> {
  const sub = (env as any).SUBSCRIBERS as D1Database | undefined;
  const cache = env.CACHE;

  if (!signingSecret) {
    return new Response(JSON.stringify({ error: 'IPN secret not configured' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }

  // ── Step 1: Verify HMAC signature ──
  const signature = request.headers.get('X-NOWPayments-Sig');
  if (!signature) {
    logger.warn('[nowpayments-ipn] missing signature');
    return new Response(JSON.stringify({ error: 'Missing signature' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }

  const body = await request.text();
  const encoder = new TextEncoder();
  const keyData = encoder.encode(signingSecret);
  const msgData = encoder.encode(body);

  let expectedSig: string;
  try {
    const cryptoKey = await crypto.subtle.importKey('raw', keyData, { name: 'HMAC', hash: 'SHA-512' }, false, ['sign']);
    const sigBuffer = await crypto.subtle.sign('HMAC', cryptoKey, msgData);
    expectedSig = Array.from(new Uint8Array(sigBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
  } catch (err) {
    logger.error('[nowpayments-ipn] HMAC verify failed', { error: String(err) });
    return new Response(JSON.stringify({ error: 'Invalid signature' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }

  if (signature !== expectedSig) {
    logger.warn('[nowpayments-ipn] signature mismatch');
    return new Response(JSON.stringify({ error: 'Invalid signature' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }

  // ── Step 2: Parse IPN body ──
  let ipn: NowPaymentsIPN;
  try {
    ipn = JSON.parse(body);
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  const invoiceId = String(ipn.payment_id);
  const status = ipn.payment_status?.toLowerCase();
  logger.info('[nowpayments-ipn] received', { invoiceId, status });

  // ── Step 3: Deduplicate (replay protection) ──
  if (sub) {
    const dedupResult = await sub.prepare(
      'SELECT id, status, raw_payload FROM payment_logs WHERE invoice_id = ? AND status = ? LIMIT 1'
    ).bind(invoiceId, status).first<{ id: string; status: string }>();

    if (dedupResult) {
      logger.info('[nowpayments-ipn] duplicate suppressed', { invoiceId, status, logId: dedupResult.id });
      return new Response(
        JSON.stringify({ received: true, dedup: true, logId: dedupResult.id }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // ── Step 4: Log IPN ──
    const logId = await sub.prepare(
      `INSERT INTO payment_logs (invoice_id, payment_id, amount, currency, status, raw_payload, verified, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 1, datetime('now'))`
    ).bind(
      invoiceId,
      ipn.payment_id,
      ipn.price_amount,
      ipn.price_currency,
      status,
      body
    ).run();

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

  return new Response(
    JSON.stringify({ received: true, status }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
}

async function processConfirmedPayment(db: D1Database, cache: KVNamespace, ipn: NowPaymentsIPN): Promise<void> {
  const purchaseId = ipn.purchase_id ?? ipn.order_id;
  if (!purchaseId) {
    logger.warn('[nowpayments-ipn] no purchase_id in IPN, cannot map to user');
    return;
  }

  // Map purchase_id to user from KV (set at invoice creation time)
  const mappingJson = await cache.get(`invoice:${purchaseId}`);
  if (!mappingJson) {
    logger.warn('[nowpayments-ipn] no invoice mapping found', { purchaseId });
    return;
  }

  try {
    const mapping = JSON.parse(mappingJson) as { userId: string; tier: string };
    const tier = mapTierFromInvoice(ipn.price_amount);
    if (!tier) {
      logger.warn('[nowpayments-ipn] unmatched amount for tier mapping', { amount: ipn.price_amount });
      return;
    }

    const now = new Date().toISOString();
    const periodEnd = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();
    const id = `sub_${Date.now()}_${Math.random().toString(36).slice(2,6)}`;

    await db.prepare(
      `INSERT INTO subscriptions (id, user_id, tier, status, amount_cents, currency, nowpayments_invoice_id, current_period_start, current_period_end, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(id, mapping.userId, tier, 'active', Math.round(ipn.price_amount * 100), ipn.price_currency, String(ipn.payment_id), now, periodEnd, now).run();

    await cache.put(`tier:${mapping.userId}`, tier, { expirationTtl: 300 });
    logger.info('[nowpayments-ipn] tier updated', { userId: mapping.userId, tier });
  } catch (err) {
    logger.error('[nowpayments-ipn] tier update failed', { error: String(err) });
  }
}

function mapTierFromInvoice(amount: number): string | null {
  // Amount in original currency (usd typical)
  const amounts: Record<string, number> = { STARTER: 49, PRO: 99, ENTERPRISE: 299, MASTER: 999 };
  for (const [tier, expected] of Object.entries(amounts)) {
    if (Math.abs(amount - expected) < 0.01) return tier;
  }
  return null;
}
