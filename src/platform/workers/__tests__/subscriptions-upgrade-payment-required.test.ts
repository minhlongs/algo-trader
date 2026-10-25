/**
 * A paid tier must never be granted at request time.
 *
 * `handleUpgrade` used to INSERT a subscriptions row with `status: 'active'`,
 * `nowpayments_invoice_id` NULL, and write the `tier:*` KV cache — so any
 * authenticated user could self-upgrade to any paid tier with no payment at all.
 * These tests pin the invariant: an upgrade request produces a checkout URL and
 * writes nothing.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { KVNamespace, D1Database } from '@cloudflare/workers-types';

const createInvoice = vi.fn<(key: string, order: string, desc: string, price: number) => Promise<string | null>>();

vi.mock('../coupon-helpers', () => ({
  createInvoice: (...args: Parameters<typeof createInvoice>) => createInvoice(...args),
}));

import { handleUpgrade, handleGetTiers, handleGetMySubscription, handleCancel } from '../api/subscriptions-handlers';
import type { Env } from '../api/subscriptions-types';

const CHECKOUT_URL = 'https://nowpayments.io/payment?iid=test-invoice-1';

/** `resolveUserFromRequest` base64-decodes the JWT payload without signature check. */
const testToken = [
  btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' })),
  btoa(JSON.stringify({ sub: 'purchaser@somewhere-real.test', tenantId: 'tenant_1' })),
  'signature',
].join('.');

function makeEnv(): Env {
  const kvPuts: Array<[string, string]> = [];
  const d1Runs: Array<{ sql: string }> = [];
  const env = {
    CACHE: { get: async () => null, put: async (k: string, v: string) => { kvPuts.push([k, v]); }, delete: async () => {} } as unknown as KVNamespace,
    SUBSCRIBERS: {
      prepare: (sql: string) => {
        d1Runs.push({ sql });
        const stmt = { bind: () => stmt, first: async <T,>() => null as T | null, run: async () => ({ success: true }), all: async () => ({ results: [] }) };
        return stmt;
      },
    } as unknown as D1Database,
    NOWPAYMENTS_API_KEY: 'test-api-key',
    JWT_SECRET: 'test-secret',
    ENVIRONMENT: 'test',
  } as unknown as Env;
  return Object.assign(env, { __kvPuts: kvPuts, __d1Runs: d1Runs });
}

/** Env plus the spies attached by makeEnv. */
type SpyEnv = Env & { __kvPuts: Array<[string, string]>; __d1Runs: Array<{ sql: string }> };

const upgradeRequest = (tier: string, force = false) =>
  new Request('https://api.cashclaw.cc/api/v1/subscriptions/upgrade', {
    method: 'POST',
    headers: { Authorization: `Bearer ${testToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ tier, force }),
  });

beforeEach(() => {
  createInvoice.mockReset();
  createInvoice.mockResolvedValue(CHECKOUT_URL);
});

describe('subscriptions upgrade requires payment', () => {
  it('returns a checkout URL rather than an active subscription', async () => {
    const env = makeEnv() as SpyEnv;
    const res = await handleUpgrade(upgradeRequest('PRO'), env);

    expect(res.status).toBe(201);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.checkoutUrl).toBe(CHECKOUT_URL);
    expect(body.status).toBe('pending_payment');
    expect(body.status).not.toBe('active');
  });

  it('creates a NOWPayments invoice for the requested tier', async () => {
    const env = makeEnv() as SpyEnv;
    await handleUpgrade(upgradeRequest('ENTERPRISE'), env);

    expect(createInvoice).toHaveBeenCalledTimes(1);
    const [apiKey, , description, price] = createInvoice.mock.calls[0];
    expect(apiKey).toBe('test-api-key');
    expect(description).toContain('ENTERPRISE');
    expect(price).toBe(299);
  });

  it('never writes an active subscription row', async () => {
    const env = makeEnv() as SpyEnv;
    await handleUpgrade(upgradeRequest('PRO'), env);

    const inserts = env.__d1Runs.filter((q) => /INSERT INTO subscriptions/i.test(q.sql));
    expect(inserts).toHaveLength(0);
    expect(env.__d1Runs.some((q) => /status[^,]*active/i.test(q.sql))).toBe(false);
  });

  it('does not cache the tier before payment lands', async () => {
    const env = makeEnv() as SpyEnv;
    await handleUpgrade(upgradeRequest('PRO'), env);

    expect(env.__kvPuts.filter(([k]) => k.startsWith('tier:'))).toHaveLength(0);
  });

  it('refuses quote-only tiers instead of pricing them', async () => {
    const env = makeEnv() as SpyEnv;
    const res = await handleUpgrade(upgradeRequest('MASTER'), env);

    expect(res.status).toBe(400);
    const body = (await res.json()) as Record<string, unknown>;
    expect(String(body.error)).toMatch(/quote-only/i);
    expect(createInvoice).not.toHaveBeenCalled();
  });

  it('refuses FREE as an upgrade and creates no invoice', async () => {
    const env = makeEnv() as SpyEnv;
    const res = await handleUpgrade(upgradeRequest('FREE'), env);

    expect(res.status).toBe(400);
    expect(createInvoice).not.toHaveBeenCalled();
  });

  it('fails closed when the payment provider is not configured', async () => {
    const env = makeEnv() as SpyEnv;
    (env as { NOWPAYMENTS_API_KEY?: string }).NOWPAYMENTS_API_KEY = undefined;

    const res = await handleUpgrade(upgradeRequest('PRO'), env);
    // Must not grant the tier just because checkout is unavailable.
    expect(res.status).toBe(503);
    expect(createInvoice).not.toHaveBeenCalled();
    expect(env.__kvPuts.filter(([k]) => k.startsWith('tier:'))).toHaveLength(0);
  });

  it('validates upgrade inputs, auth, D1 binding, duplicate tiers, and provider failures', async () => {
    const env = makeEnv() as SpyEnv;
    expect((await handleUpgrade(new Request('https://api.cashclaw.cc/api/v1/subscriptions/upgrade', { method: 'POST' }), env)).status).toBe(401);
    expect((await handleUpgrade(upgradeRequest(''), env)).status).toBe(400);

    const noDbEnv = { ...makeEnv(), SUBSCRIBERS: undefined } as unknown as Env;
    expect((await handleUpgrade(upgradeRequest('PRO'), noDbEnv)).status).toBe(503);

    createInvoice.mockResolvedValueOnce(null);
    expect((await handleUpgrade(upgradeRequest('PRO'), env)).status).toBe(502);
  });

  it('handles get-my-subscription and cancel lifecycle states cleanly', async () => {
    const noDbEnv = { ...makeEnv(), SUBSCRIBERS: undefined } as unknown as Env;
    expect((await handleGetMySubscription(new Request('https://api.cashclaw.cc/api/v1/subscriptions/me'), noDbEnv)).status).toBe(200);
    expect((await handleCancel(new Request('https://api.cashclaw.cc/api/v1/subscriptions/cancel', { method: 'DELETE' }), noDbEnv)).status).toBe(503);

    const env = makeEnv() as SpyEnv;
    expect((await handleGetMySubscription(new Request('https://api.cashclaw.cc/api/v1/subscriptions/me'), env)).status).toBe(401);
    expect((await handleCancel(new Request('https://api.cashclaw.cc/api/v1/subscriptions/cancel', { method: 'DELETE' }), env)).status).toBe(401);

    const authedGet = new Request('https://api.cashclaw.cc/api/v1/subscriptions/me', {
      headers: { Authorization: `Bearer ${testToken}`, Origin: 'https://cashclaw.cc' },
    });
    expect((await handleGetMySubscription(authedGet, env)).status).toBe(200);

    const authedCancel = new Request('https://api.cashclaw.cc/api/v1/subscriptions/cancel', {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${testToken}`, Origin: 'https://cashclaw.cc' },
    });
    expect((await handleCancel(authedCancel, env)).status).toBe(404);

    const activeRow = {
      id: 'sub-row-1', user_id: 'tenant_1', tier: 'PRO' as const, status: 'active' as const,
      amount_cents: 9900, currency: 'usd', nowpayments_invoice_id: 'inv-1',
      current_period_start: '2026-10-01', current_period_end: '2026-11-01',
      created_at: '2026-10-01', updated_at: '2026-10-01',
    };
    const activeEnv = {
      ...makeEnv(),
      SUBSCRIBERS: {
        prepare: () => {
          const stmt = { bind: () => stmt, first: async <T,>() => activeRow as unknown as T, run: async () => ({ success: true }) };
          return stmt;
        },
      } as unknown as D1Database,
    } as unknown as Env;
    expect((await handleGetMySubscription(authedGet, activeEnv)).status).toBe(200);
    expect((await handleUpgrade(upgradeRequest('PRO'), activeEnv)).status).toBe(409);
    expect((await handleCancel(authedCancel, activeEnv)).status).toBe(200);
  });
});

describe('served tier list', () => {
  it('states a real price for every tier, never "Custom", and only advertises activatable keys', async () => {
    const res = await handleGetTiers();
    const body = (await res.json()) as { tiers: Array<{ tier: string; label: string; amount_cents: number }> };
    const activatable = ['FREE', 'STARTER', 'PRO', 'ENTERPRISE', 'MASTER'];
    for (const t of body.tiers) {
      expect(t.label).not.toMatch(/custom/i);
      if (t.tier === 'MASTER') expect(t.label).toContain('999');
      expect(activatable).toContain(t.tier);
    }
  });
});
