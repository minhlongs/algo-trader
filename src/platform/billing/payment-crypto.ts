/**
 * Payment Cryptographic Utilities & Token Generation
 */

import * as crypto from 'crypto';

export function signStripeWebhook(event: unknown, secret: string): string {
  const raw = JSON.stringify(event);
  return crypto.createHmac('sha256', secret).update(raw, 'utf8').digest('hex');
}

export function verifyStripeSignature(event: unknown, signature: string, secret: string): boolean {
  const expected = signStripeWebhook(event, secret);
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

export function generatePaymentId(): string {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}
