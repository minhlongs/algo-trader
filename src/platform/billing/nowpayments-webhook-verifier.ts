/**
 * Webhook signature verification for NOWPayments IPN.
 *
 * @module platform/billing/nowpayments-webhook-verifier
 */

import { logger } from '../../shared/utils/logger';
import { sortObjectDeep, constantTimeEqual } from '../workers/nowpayments-utils';

/**
 * Verify IPN webhook signature (HMAC-SHA512 over sorted JSON keys with raw fallback)
 */
export async function verifyWebhookSignature(
  rawBody: string,
  signature: string,
  ipnSecret: string,
): Promise<boolean> {
  if (!ipnSecret) {
    logger.warn('NOWPAYMENTS_IPN_SECRET not configured');
    return false;
  }
  try {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(ipnSecret),
      { name: 'HMAC', hash: 'SHA-512' },
      false,
      ['sign'],
    );
    const signHmac = async (data: string): Promise<string> => {
      const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(data));
      return Array.from(new Uint8Array(sig))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
    };
    try {
      const sorted = sortObjectDeep(JSON.parse(rawBody));
      const sortedSig = await signHmac(JSON.stringify(sorted));
      if (constantTimeEqual(sortedSig, signature)) return true;
    } catch {
      // Fallback for non-JSON or raw payload
    }
    return constantTimeEqual(await signHmac(rawBody), signature);
  } catch (error) {
    logger.error('IPN signature verification failed:', { error });
    return false;
  }
}
