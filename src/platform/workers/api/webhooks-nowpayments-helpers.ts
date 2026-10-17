/**
 * NOWPayments IPN webhook helper types, HMAC verification, and tier mapping.
 */

import { logger } from '../../../shared/utils/logger';
import type { D1Database, KVNamespace } from '@cloudflare/workers-types';

export interface Env {
  CACHE: KVNamespace;
  SUBSCRIBERS?: D1Database;
  JWT_SECRET?: string;
  ALLOWED_ORIGINS?: string;
  NOWPAYMENTS_IPN_SECRET?: string;
  ENVIRONMENT?: string;
  VPS_ORIGIN?: string;
  REGION_ROUTING_ENABLED?: string;
}

export interface NowPaymentsIPN {
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

export function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function verifyNowPaymentsSignature(
  body: string,
  signature: string,
  signingSecret: string,
): Promise<boolean> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(signingSecret);
  const msgData = encoder.encode(body);

  try {
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: 'SHA-512' },
      false,
      ['sign'],
    );
    const sigBuffer = await crypto.subtle.sign('HMAC', cryptoKey, msgData);
    const expectedSig = Array.from(new Uint8Array(sigBuffer))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    if (signature !== expectedSig) {
      logger.warn('[nowpayments-ipn] signature mismatch');
      return false;
    }
    return true;
  } catch (err) {
    logger.error('[nowpayments-ipn] HMAC verify failed', { error: String(err) });
    return false;
  }
}

export async function processConfirmedPayment(
  db: D1Database,
  cache: KVNamespace,
  ipn: NowPaymentsIPN,
): Promise<void> {
  const purchaseId = ipn.purchase_id ?? ipn.order_id;
  if (!purchaseId) {
    logger.warn('[nowpayments-ipn] no purchase_id in IPN, cannot map to user');
    return;
  }

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
    const id = `sub_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

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

export function mapTierFromInvoice(amount: number): string | null {
  const amounts: Record<string, number> = { STARTER: 49, PRO: 99, ENTERPRISE: 299, MASTER: 999 };
  for (const [tier, expected] of Object.entries(amounts)) {
    if (Math.abs(amount - expected) < 0.01) return tier;
  }
  return null;
}
