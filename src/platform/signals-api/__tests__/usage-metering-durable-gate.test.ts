/**
 * The quota gate's decision must come from the durable row, not from an
 * in-process counter. Before this, `remaining` came from an InMemoryCounter
 * that was never reset: it counted monotonically down until the process
 * restarted, then started over — so the same subscriber was blocked before a
 * restart and unblocked after one.
 *
 * The blocking number and the billing number are now the same row: `check`
 * reads `calls_this_period`, and `recordCall` increments it and returns the new
 * value. These tests pin that equivalence.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const queryMock = vi.fn();
const errorMock = vi.fn();

vi.mock('../../../db/postgres-client', () => ({ query: (...a: unknown[]) => queryMock(...a) }));
vi.mock('../../../shared/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: (...a: unknown[]) => errorMock(...a) },
}));

import { UsageMeteringService } from '../usage-metering-service';
import { enforceQuotaGate, checkQuota } from '../../middleware/signal-quota-gate';
import { FakeUsageStore, mockQuery } from './durable-quota-fixtures';
import type { Request, Response } from 'express';

function res(): Response & { statusCode: number; body: unknown } {
  const r = {
    statusCode: 0,
    body: undefined as unknown,
    status(code: number) {
      r.statusCode = code;
      return r;
    },
    json(payload: unknown) {
      r.body = payload;
      return r;
    },
  };
  return r as unknown as Response & { statusCode: number; body: unknown };
}

function req(subscriber?: { subscriberId: string; tier: string }): Request {
  return { subscriber } as Request;
}

/** The YYYY-MM key the service derives for a given instant. */
function periodOf(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

describe('durable quota gate', () => {
  let service: UsageMeteringService;
  let store: FakeUsageStore;
  const today = periodOf(new Date());

  beforeEach(() => {
    vi.clearAllMocks();
    store = new FakeUsageStore();
    service = new UsageMeteringService();
    // clearAllMocks drops mockImplementation, so re-arm the fake store here.
    queryMock.mockImplementation(mockQuery(store));
  });

  it('allows a caller under the limit and reports the durable count', async () => {
    await service.recordCall('sub-1', 'PRO');
    const decision = await service.check('sub-1', 'PRO');

    expect(decision.allowed).toBe(true);
    expect(decision.used).toBe(1);
    expect(decision.limit).toBe(10_000);
    expect(decision.remaining).toBe(10_000 - 1);
  });

  it('blocks a caller at the limit with the blocking number equal to the limit', async () => {
    store.seed('sub-2', today, 1_000);

    const atLimit = await service.check('sub-2', 'FREE');
    expect(atLimit.allowed).toBe(false);
    expect(atLimit.limitReached).toBe(true);
    expect(atLimit.used).toBe(atLimit.limit);
    expect(atLimit.remaining).toBe(0);

    await service.recordCall('sub-2', 'FREE');
    const over = await service.check('sub-2', 'FREE');
    expect(over.allowed).toBe(false);
    expect(over.used).toBe(1_001);
    expect(over.overage).toBe(1);
  });

  it('agrees with the number recordCall reports, so billing and blocking match', async () => {
    // The failure this guards against: two readers of two counters disagreeing,
    // which is what let usage go unblocked and unbilled at the same time.
    let recorded = -1;
    for (let i = 0; i < 5; i++) {
      recorded = await service.recordCall('sub-3', 'PRO');
    }
    const decision = await service.check('sub-3', 'PRO');
    expect(decision.used).toBe(recorded);
    expect(decision.remaining).toBe(decision.limit - recorded);
  });

  it('does not change its answer when the process restarts', async () => {
    await service.recordCall('sub-4', 'FREE');
    await service.recordCall('sub-4', 'FREE');
    const before = await service.check('sub-4', 'FREE');

    // A restart loses every in-memory object but keeps the durable row.
    const after = await new UsageMeteringService().check('sub-4', 'FREE');

    expect(after.allowed).toBe(before.allowed);
    expect(after.used).toBe(before.used);
    expect(after.remaining).toBe(before.remaining);
  });

  it('returns 503 (not 200) when the durable read fails', async () => {
    queryMock.mockRejectedValueOnce(new Error('connection refused'));
    const r = res();
    let nextCalled = false;

    enforceQuotaGate(req({ subscriberId: 'sub-5', tier: 'PRO' }), r, () => {
      nextCalled = true;
    });

    await vi.waitFor(() => expect(r.statusCode).toBe(503));
    expect(nextCalled).toBe(false);
    expect(errorMock).toHaveBeenCalled();
  });

  it('passes an under-limit caller through and lets the handler respond', async () => {
    store.seed('sub-6', today, 1);
    const r = res();
    let nextCalled = false;

    enforceQuotaGate(req({ subscriberId: 'sub-6', tier: 'PRO' }), r, () => {
      nextCalled = true;
    });

    await vi.waitFor(() => expect(nextCalled).toBe(true));
    expect(r.statusCode).toBe(0);
  });

  it('answers 429 with the durable usage when the budget is spent', async () => {
    store.seed('sub-7', today, 1_000);
    const r = res();
    let nextCalled = false;

    enforceQuotaGate(req({ subscriberId: 'sub-7', tier: 'FREE' }), r, () => {
      nextCalled = true;
    });

    await vi.waitFor(() => expect(r.statusCode).toBe(429));
    expect(nextCalled).toBe(false);
    expect(r.body).toMatchObject({ quota: { used: 1_000, limit: 1_000 } });
  });

  it('never turns an unidentified caller into an authentication error of its own', async () => {
    const r = res();
    let nextCalled = false;

    enforceQuotaGate(req(undefined), r, () => {
      nextCalled = true;
    });

    await vi.waitFor(() => expect(nextCalled).toBe(true));
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('reads the limit for every sellable tier from the price book, not a default', async () => {
    // A tier missing from MONTHLY_LIMITS falls back to the FREE allowance,
    // which under-serves and under-bills the customer paying for it.
    const expected: Record<string, number> = {
      FREE: 1_000,
      STARTER: 5_000,
      PRO: 10_000,
      ENTERPRISE: 100_000,
      MASTER: -1,
    };
    for (const [tier, limit] of Object.entries(expected)) {
      const decision = await checkQuota('sub-tier', tier);
      expect(decision.limit, `limit for ${tier}`).toBe(limit);
      expect(decision.period).toBe(today);
    }
  });

  it('never bills or blocks an unlimited tier against a negative allowance', async () => {
    const decision = await checkQuota('sub-master', 'MASTER');
    expect(decision.allowed).toBe(true);
    expect(service.computeOverage('MASTER', 5_000_000)).toBe(0);
  });
});
