/**
 * Tier Activation Signature Verification
 * Cryptographic verification of NOWPayments IPN webhooks.
 */

import crypto from 'node:crypto';
import { logger } from '../shared/utils/logger';
import { sortObjectDeep } from '../platform/workers/nowpayments-utils';

export function verifyIpnSignature(
  rawBody: string,
  signature: string,
  ipnSecret?: string
): boolean {
  if (!ipnSecret) return false;
  try {
    const sigBuf = Buffer.from(signature.trim(), 'utf8');
    try {
      const sorted = sortObjectDeep(JSON.parse(rawBody));
      const sortedHmac = crypto
        .createHmac('sha512', ipnSecret)
        .update(JSON.stringify(sorted))
        .digest('hex');
      const sortedBuf = Buffer.from(sortedHmac, 'utf8');
      if (
        sortedBuf.length === sigBuf.length &&
        crypto.timingSafeEqual(sortedBuf, sigBuf)
      ) {
        return true;
      }
    } catch {
      // Fallback to raw verification if sorting fails
    }
    const rawHmac = crypto
      .createHmac('sha512', ipnSecret)
      .update(rawBody)
      .digest('hex');
    const rawBuf = Buffer.from(rawHmac, 'utf8');
    return (
      rawBuf.length === sigBuf.length && crypto.timingSafeEqual(rawBuf, sigBuf)
    );
  } catch (err) {
    logger.error('[TierActivationGateway] Signature check error:', { err });
    return false;
  }
}
