import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NowPaymentsService } from '../nowpayments-service';

const SECRET = 'test-ipn-secret';
const PAYLOAD = { payment_id: 'pay-1', payment_status: 'finished' };

describe('NowPaymentsService worker-boundary', () => {
  let service: NowPaymentsService;

  beforeEach(() => {
    process.env.NOWPAYMENTS_IPN_SECRET = SECRET;
    process.env.NOWPAYMENTS_API_KEY = 'key';
    (NowPaymentsService as any).instance = undefined;
    service = NowPaymentsService.getInstance();
  });

  it('verifyWebhook returns true for valid payload and signature', async () => {
    const rawBody = JSON.stringify(PAYLOAD);

    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(SECRET),
      { name: 'HMAC', hash: 'SHA-512' },
      false,
      ['sign']
    );
    const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(rawBody));
    const signature = Array.from(new Uint8Array(sig))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    const ok = await service.verifyWebhook(rawBody, signature);
    expect(ok).toBe(true);
  });

  it('verifyWebhook returns false when secret missing', async () => {
    process.env.NOWPAYMENTS_IPN_SECRET = '';
    (NowPaymentsService as any).instance = undefined;
    const emptySecretSvc = NowPaymentsService.getInstance();

    const ok = await emptySecretSvc.verifyWebhook(JSON.stringify(PAYLOAD), 'abc');
    expect(ok).toBe(false);
  });

  it('verifyWebhook rejects on JSON parse failure gracefully', async () => {
    const ok = await service.verifyWebhook('not-json', 'abc');
    expect(ok).toBe(false);
  });

  it('verifyWebhook skips when key non-secret, returns false, no throw', async () => {
    const sig = '000deadbeef000';
    const ok = await service.verifyWebhook(JSON.stringify(PAYLOAD), sig);
    expect(typeof ok).toBe('boolean');
    expect(ok).toBe(false);
  });

  it('verifyWebhook is false on bad signature', async () => {
    const ok = await service.verifyWebhook(JSON.stringify(PAYLOAD), 'bad-sig');
    expect(ok).toBe(false);
  });
});
