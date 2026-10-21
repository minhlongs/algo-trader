/**
 * Tenant-guard verification — calls handlers with plain stub req/res objects
 * so no socket is bound (sandbox forbids local listen).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const store = {
  rows: [] as Array<{ id: string; subscriberId: string; tier: string; active: boolean }>,
  usage: new Map<string, unknown>(),
};

vi.mock('../../../../platform/signal/signal-subscriber-repository-d1', () => ({
  signalSubscriberRepo: {
    getBySubscriberId: vi.fn((id: string) => Promise.resolve(store.rows.find((r) => r.subscriberId === id) ?? null)),
    getActiveSubscriptions: vi.fn(() => Promise.resolve(store.rows.filter((r) => r.active))),
    // Reproduces the real repository semantics: setActive matches subscriber_id.
    setActive: vi.fn((subscriberId: string, on: boolean) => {
      const row = store.rows.find((r) => r.subscriberId === subscriberId);
      if (!row) return Promise.resolve();
      row.active = on;
      return Promise.resolve();
    }),
    upsert: vi.fn(),
  },
}));
vi.mock('../../../../platform/signals-api/usage-metering-service', () => ({
  usageMetering: { getSnapshot: vi.fn((id: string) => Promise.resolve(store.usage.get(id) ?? null)) },
}));
vi.mock('../../../middleware/signal-tier-resolver', () => ({
  resolveSubscriberId: vi.fn((req: { headers: { authorization?: string } }) => {
    const key = (req.headers.authorization ?? '').replace('Bearer ', '');
    if (!key.startsWith('key-')) return null;
    return { subscriberId: key.slice(4), tier: 'PRO' };
  }),
}));
vi.mock('../../../shared/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import {
  handleGetTenantSubscription,
  handleGetUsageSnapshot,
  handleListActiveSubscriptions,
  handleCancelSubscription,
  handleCancelCurrentSubscription,
} from '../signal-subscription-handlers';

interface Stub {
  code: number;
  body: unknown;
}
function res() {
  const out: Stub = { code: 200, body: undefined };
  return {
    out,
    status(c: number) { out.code = c; return this; },
    json(b: unknown) { out.body = b; return this; },
  } as unknown as { status(c: number): { json(b: unknown): void } } & { out: Stub };
}

beforeEach(() => {
  store.rows = [
    { id: 's1', subscriberId: 'alice', tier: 'PRO', active: true },
    { id: 's2', subscriberId: 'bob', tier: 'PRO', active: true },
  ];
  store.usage.set('alice', { subscriberId: 'alice', period: '2026-10', callsThisPeriod: 5, periodLimit: 100, overageCalls: 0 });
});

describe('GET /subscriptions/:tenantId', () => {
  it('200 for the owner', async () => {
    const r = res();
    await handleGetTenantSubscription({ headers: { authorization: 'Bearer key-alice' }, params: { tenantId: 'alice' } } as never, r as never);
    expect(r.out.code).toBe(200);
  });
  it('403 for a different tenant (was 200 before the guard)', async () => {
    const r = res();
    await handleGetTenantSubscription({ headers: { authorization: 'Bearer key-alice' }, params: { tenantId: 'bob' } } as never, r as never);
    expect(r.out.code).toBe(403);
  });
  it('401 without a key', async () => {
    const r = res();
    await handleGetTenantSubscription({ headers: {}, params: { tenantId: 'bob' } } as never, r as never);
    expect(r.out.code).toBe(401);
  });
});

describe('GET /usage/:subscriberId', () => {
  it('200 for the owner', async () => {
    const r = res();
    await handleGetUsageSnapshot({ headers: { authorization: 'Bearer key-alice' }, params: { subscriberId: 'alice' } } as never, r as never);
    expect(r.out.code).toBe(200);
  });
  it('403 for another tenant', async () => {
    const r = res();
    await handleGetUsageSnapshot({ headers: { authorization: 'Bearer key-alice' }, params: { subscriberId: 'bob' } } as never, r as never);
    expect(r.out.code).toBe(403);
  });
});

describe('GET /subscriptions/active', () => {
  it('401 without a key (was 200 leaking every tenant)', async () => {
    const r = res();
    await handleListActiveSubscriptions({ headers: {} } as never, r as never);
    expect(r.out.code).toBe(401);
  });
  it('403 for a non-admin caller', async () => {
    const r = res();
    await handleListActiveSubscriptions({ headers: { authorization: 'Bearer key-alice' } } as never, r as never);
    expect(r.out.code).toBe(503);
  });
});

describe('DELETE /subscriptions/:id', () => {
  it('owner may cancel own row', async () => {
    const r = res();
    await handleCancelSubscription({ headers: { authorization: 'Bearer key-alice' }, params: { id: 's1' } } as never, r as never);
    expect(r.out.code).toBe(200);
    expect(store.rows[0].active).toBe(false);
  });
  it('403 when cancelling someone else row', async () => {
    const r = res();
    await handleCancelSubscription({ headers: { authorization: 'Bearer key-alice' }, params: { id: 's2' } } as never, r as never);
    expect(r.out.code).toBe(503);
    expect(store.rows[1].active).toBe(true);
  });
  it('404 for unknown id', async () => {
    const r = res();
    await handleCancelSubscription({ headers: { authorization: 'Bearer key-alice' }, params: { id: 'nope' } } as never, r as never);
    expect(r.out.code).toBe(404);
  });
});

describe('DELETE /subscription (self-cancel)', () => {
  it('cancels the caller own active subscription', async () => {
    const r = res();
    await handleCancelCurrentSubscription({ headers: { authorization: 'Bearer key-alice' } } as never, r as never);
    expect(r.out.code).toBe(200);
    expect(store.rows[0].active).toBe(false);
  });

  it('passes subscriberId to setActive, not the row id', async () => {
    const { signalSubscriberRepo } = await import('../../../../platform/signal/signal-subscriber-repository-d1');
    const r = res();
    await handleCancelCurrentSubscription({ headers: { authorization: 'Bearer key-alice' } } as never, r as never);
    expect(signalSubscriberRepo.setActive).toHaveBeenCalledWith('alice', false);
  });
  it('404 when already cancelled', async () => {
    store.rows[1].active = false;
    const r = res();
    await handleCancelCurrentSubscription({ headers: { authorization: 'Bearer key-bob' } } as never, r as never);
    expect(r.out.code).toBe(404);
  });
});
