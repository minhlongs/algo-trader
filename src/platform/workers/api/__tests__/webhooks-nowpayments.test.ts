import { describe, it, expect, beforeEach, vi } from 'vitest';
import { handleNowPaymentsIPN } from '../webhooks-nowpayments';

function makeEnv(overrides: Record<string, unknown> = {}) {
  return {
    CACHE: {} as any,
    NOWPAYMENTS_IPN_SECRET: 'test-secret',
    ...overrides,
  };
}

function makeBody(data: Record<string, unknown>) {
  return JSON.stringify(data);
}

function makeSig(body: string, secret: string) {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const msgData = encoder.encode(body);
  return crypto.subtle
    .importKey('raw', keyData, { name: 'HMAC', hash: 'SHA-512' }, false, ['sign'])
    .then((key) => crypto.subtle.sign('HMAC', key, msgData))
    .then((buf) => Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join(''));
}

describe('handleNowPaymentsIPN', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns 500 when signing secret missing', async () => {
    const env = makeEnv({ NOWPAYMENTS_IPN_SECRET: undefined });
    const req = {
      headers: new Headers(),
      text: async () => '{}',
    } as any;

    const res = await handleNowPaymentsIPN(req as Request, env, undefined);
    expect(res.status).toBe(500);
  });

  it('returns 401 when signature header missing', async () => {
    const env = makeEnv();
    const body = makeBody({ payment_id: 1, payment_status: 'waiting' });
    const req = {
      headers: new Headers(),
      text: async () => body,
    } as any;

    const res = await handleNowPaymentsIPN(req as Request, env, 'test-secret');
    expect(res.status).toBe(401);
  });

  it('returns 200 on valid finished/finished signature without D1', async () => {
    const body = makeBody({ payment_id: 1, payment_status: 'finished', order_id: 'order-1', price_amount: 99 });
    const sig = await makeSig(body, 'test-secret');
    const env = makeEnv({
      SUBSCRIBERS: undefined,
      CACHE: {
        get: async () => null,
        put: async () => {},
      } as any,
    });
    const headers = new Headers({ 'X-NOWPayments-Sig': sig });
    const req = {
      headers,
      text: async () => body,
    } as any;

    const res = await handleNowPaymentsIPN(req as Request, env, 'test-secret');
    expect(res.status).toBe(200);
  });

  it('returns 200 and dedupes matching invoice_id+status in D1', async () => {
    const body = makeBody({ payment_id: 1, payment_status: 'confirmed', order_id: 'order-1', price_amount: 99 });
    const sig = await makeSig(body, 'test-secret');
    const env = makeEnv({
      CACHE: {
        get: async () => null,
        put: async () => {},
      } as any,
      SUBSCRIBERS: {
        prepare: () => ({
          bind: () => ({
            first: async () => ({ id: 'log-1', status: 'confirmed' }),
          }),
        }),
      } as any,
    });
    const headers = new Headers({ 'X-NOWPayments-Sig': sig });
    const req = {
      headers,
      text: async () => body,
    } as any;

    const res = await handleNowPaymentsIPN(req as Request, env, 'test-secret');
    expect(res.status).toBe(200);
  });

  it('writes payment_log and processes confirmed payment in D1', async () => {
    const body = makeBody({ payment_id: 7, payment_status: 'confirmed', order_id: 'ord-7', price_amount: 99 });
    const sig = await makeSig(body, 'test-secret');

    const prepares: any[] = [];
    const env = makeEnv({
      CACHE: {
        get: async () => JSON.stringify({ userId: 'u1', tier: 'PRO' }),
        put: async () => {},
      } as any,
      SUBSCRIBERS: {
        prepare: (sql: string) => {
          const step = {
            bind: (...args: any[]) => {
              if (sql.includes('SELECT')) {
                return {
                  first: async () => null,
                };
              }
              return step;
            },
            run: async () => ({ meta: { last_row_id: 11 } }),
          };
          prepares.push(sql);
          return step;
        },
      } as any,
    });

    const headers = new Headers({ 'X-NOWPayments-Sig': sig });
    const req = {
      headers,
      text: async () => body,
    } as any;

    const res = await handleNowPaymentsIPN(req as Request, env, 'test-secret');
    expect(res.status).toBe(200);
    expect(prepares.some((sql) => sql.includes('INSERT INTO payment_logs'))).toBe(true);
    expect(prepares.some((sql) => sql.includes('INSERT INTO subscriptions'))).toBe(true);
  });

  it('returns 400 on invalid JSON body with valid signature', async () => {
    const body = 'not-json';
    const sig = await makeSig(body, 'test-secret');
    const env = makeEnv();
    const headers = new Headers({ 'X-NOWPayments-Sig': sig });
    const req = {
      headers,
      text: async () => body,
    } as any;

    const res = await handleNowPaymentsIPN(req as Request, env, 'test-secret');
    expect(res.status).toBe(400);
  });
});
