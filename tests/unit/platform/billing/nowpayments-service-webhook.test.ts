/**
 * NowPaymentsService verifyWebhook — Unit Tests
 *
 * Verifies HMAC-SHA512 verification for IPN payloads:
 * - Unsorted JSON payload with sorted-key canonical HMAC
 * - Raw string payload verification
 * - Invalid signature returns false
 * - Missing IPN secret returns false
 * - Exception resilience returns false
 */

import crypto from 'node:crypto';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NowPaymentsService } from '../../../../src/platform/billing/nowpayments-service';

describe('NowPaymentsService — verifyWebhook', () => {
  let service: NowPaymentsService;
  const secret = 'webhook-test-secret-123';

  beforeEach(() => {
    process.env.NOWPAYMENTS_IPN_SECRET = secret;
    (NowPaymentsService as unknown as { instance: unknown }).instance = undefined;
    service = NowPaymentsService.getInstance();
  });

  it('returns false when ipnSecret is not configured', async () => {
    delete process.env.NOWPAYMENTS_IPN_SECRET;
    (NowPaymentsService as unknown as { instance: unknown }).instance = undefined;
    const noSecretService = NowPaymentsService.getInstance();

    const result = await noSecretService.verifyWebhook('{}', 'some-sig');
    expect(result).toBe(false);
  });

  it('verifies unsorted JSON payload via canonical sorted HMAC', async () => {
    const rawPayload = JSON.stringify({
      status: 'finished',
      amount: 100,
      currency: 'USDT',
      address: 'TRX123',
    });

    const sortedObj = {
      address: 'TRX123',
      amount: 100,
      currency: 'USDT',
      status: 'finished',
    };
    const expectedSig = crypto
      .createHmac('sha512', secret)
      .update(JSON.stringify(sortedObj))
      .digest('hex');

    const isValid = await service.verifyWebhook(rawPayload, expectedSig);
    expect(isValid).toBe(true);
  });

  it('verifies non-JSON raw body via fallback HMAC', async () => {
    const rawPayload = 'plain-text-ipn-body';
    const expectedSig = crypto
      .createHmac('sha512', secret)
      .update(rawPayload)
      .digest('hex');

    const isValid = await service.verifyWebhook(rawPayload, expectedSig);
    expect(isValid).toBe(true);
  });

  it('rejects tampered signature', async () => {
    const rawPayload = JSON.stringify({ status: 'finished' });
    const wrongSig = '0123456789abcdef0123456789abcdef';

    const isValid = await service.verifyWebhook(rawPayload, wrongSig);
    expect(isValid).toBe(false);
  });

  it('gracefully handles crypto error and returns false', async () => {
    const spy = vi.spyOn(globalThis.crypto.subtle, 'importKey').mockRejectedValueOnce(
      new Error('SubtleCrypto failure')
    );

    const isValid = await service.verifyWebhook('{}', 'sig');
    expect(isValid).toBe(false);
    spy.mockRestore();
  });
});
