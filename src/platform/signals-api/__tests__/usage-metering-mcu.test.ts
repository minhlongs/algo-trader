/**
 * MCU is the third domain on the one meter: API calls, trades, and now compute
 * units. It used to be counted in a `Map` inside the desk BillingMeter, so the
 * count vanished on restart and a tenant who had exhausted the allowance was
 * silently unblocked by a redeploy.
 *
 * These tests pin the durable replacement: 402-past-limit must survive a
 * restart, and an MCU must never be spent against the API-call allowance (or
 * the reverse), because the two are different units with different prices.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const queryMock = vi.fn();

vi.mock('../../../db/postgres-client', () => ({ query: (...a: unknown[]) => queryMock(...a) }));
vi.mock('../../../shared/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

import { UsageMeteringService } from '../usage-metering-service';
import { MCU_LIMITS } from '../usage-metering-types';
import { FakeUsageStore, mockQuery } from './durable-quota-fixtures';

/** YYYY-MM for a given instant, matching currentPeriod(). */
function periodOf(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

describe('durable MCU metering', () => {
  let service: UsageMeteringService;
  let store: FakeUsageStore;
  const today = periodOf(new Date());

  beforeEach(() => {
    vi.clearAllMocks();
    store = new FakeUsageStore();
    service = new UsageMeteringService();
    queryMock.mockImplementation(mockQuery(store));
  });

  it('counts MCU durably, so the count survives a process restart', async () => {
    await service.recordMcu('tenant-1', 'PRO', 400);
    await service.recordMcu('tenant-1', 'PRO', 400);

    // A restart discards every in-process object but keeps the row.
    const after = await new UsageMeteringService().checkMcu('tenant-1', 'PRO', 1);
    expect(after.used).toBe(800);
    expect(after.isAllowed).toBe(true);
  });

  it('denies past the MCU allowance with 402, on the same number that bills', async () => {
    // Read the allowance from the price book rather than hardcoding it, so a
    // price change cannot leave the test asserting a limit nobody charges.
    const allowance = MCU_LIMITS.PRO;
    store.seedMcu('tenant-2', today, allowance);

    const atLimit = await service.checkMcu('tenant-2', 'PRO', 1);
    expect(atLimit.isAllowed).toBe(false);
    expect(atLimit.statusCode).toBe(402);
    expect(atLimit.used).toBe(atLimit.limit);

    await service.recordMcu('tenant-2', 'PRO', 1);
    const over = await service.checkMcu('tenant-2', 'PRO', 1);
    expect(over.used).toBe(allowance + 1);
    expect(over.isAllowed).toBe(false);
  });

  it('keeps MCU and API calls as separate allowances on one row', async () => {
    await service.recordMcu('tenant-3', 'PRO', 2_500);
    await service.recordCall('tenant-3', 'PRO');

    const mcu = await service.checkMcu('tenant-3', 'PRO', 0);
    const calls = await service.check('tenant-3', 'PRO');

    expect(mcu.used).toBe(2_500);
    expect(calls.used).toBe(1);
    expect(mcu.limit).not.toBe(calls.limit);
  });

  it('reads the MCU allowance for every tier from the price book, not a default', async () => {
    const expected: Record<string, number> = {
      FREE: 1_000,
      STARTER: 5_000,
      PRO: 25_000,
      ENTERPRISE: 250_000,
      MASTER: -1,
    };
    for (const [tier, limit] of Object.entries(expected)) {
      const decision = await service.checkMcu('tenant-tier', tier, 0);
      expect(decision.limit, `limit for ${tier}`).toBe(limit);
    }
  });

  it('never bills an unlimited tier against a negative allowance', async () => {
    const decision = await service.checkMcu('tenant-master', 'MASTER', 5_000_000);
    expect(decision.isAllowed).toBe(true);
    expect(service.computeMcuOverage('MASTER', 5_000_000)).toBe(0);
  });
});
