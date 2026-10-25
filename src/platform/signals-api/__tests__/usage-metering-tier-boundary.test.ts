/**
 * The two tier vocabularies are separate contracts, and the boundary between them
 * must fail closed rather than fall back.
 *
 * The desk contract (`BASIC|PREMIUM|ENTERPRISE|MASTER`) prices MCU; the canonical
 * contract (`FREE|STARTER|PRO|ENTERPRISE|MASTER`) prices API calls. They are not
 * one vocabulary, so a tier name that belongs to the desk contract is *not* a
 * misspelling of a canonical tier — it is a caller crossing a boundary it does
 * not own. Falling back to the FREE allowance in that case under-serves a paying
 * customer: a PREMIUM tenant (25,000 MCU purchased) is silently charged against
 * 1,000, which is what FREE gets.
 *
 * These tests pin the boundary in both directions: a tier the price book does
 * not declare must be refused, and every tier it does declare must resolve.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const queryMock = vi.fn();

vi.mock('../../../db/postgres-client', () => ({ query: (...a: unknown[]) => queryMock(...a) }));
vi.mock('../../../shared/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

import { UsageMeteringService } from '../usage-metering-service';
import { MCU_LIMITS, MONTHLY_LIMITS } from '../usage-metering-types';
import { FakeUsageStore, mockQuery } from './durable-quota-fixtures';

/** The desk contract's tier names, which the canonical price book does not declare. */
const DESK_ONLY_TIERS = ['BASIC', 'PREMIUM'] as const;

describe('the tier boundary between the two contracts', () => {
  let service: UsageMeteringService;
  let store: FakeUsageStore;

  beforeEach(() => {
    vi.clearAllMocks();
    store = new FakeUsageStore();
    service = new UsageMeteringService();
    queryMock.mockImplementation(mockQuery(store));
  });

  it.each(DESK_ONLY_TIERS)(
    'refuses the compute-unit decision for %s instead of falling back to FREE',
    async (tier) => {
      // A silent fallback to FREE would both under-serve the tenant (1,000 MCU
      // instead of the 25,000 they bought) and under-bill them, so the decision
      // must fail closed rather than guess an allowance.
      await expect(service.checkMcu('tenant-crossing', tier, 1)).rejects.toThrow(/unknown tier/i);
    },
  );

  it('never lets a desk-only tier consume or record compute units', async () => {
    await expect(service.recordMcu('tenant-crossing', 'PREMIUM', 500)).rejects.toThrow(
      /unknown tier/i,
    );
    // Read back through the canonical price book: the rejected write must have
    // left the tenant at zero, not at a FREE-allowance figure it never earned.
    const after = await service.checkMcu('tenant-crossing', 'PRO', 0);
    expect(after.used).toBe(0);
  });

  it('refuses the API-call decision for a desk-only tier, for the same reason', async () => {
    await expect(service.check('tenant-crossing', 'PREMIUM')).rejects.toThrow(/unknown tier/i);
  });

  it('still answers every tier the canonical price book declares', async () => {
    for (const tier of Object.keys(MCU_LIMITS)) {
      const decision = await service.checkMcu('tenant-declared', tier, 1);
      expect(decision.limit, `MCU limit for ${tier}`).toBe(MCU_LIMITS[tier]);
      expect(decision.tier).toBe(tier);
    }
  });

  it('still answers every tier the API-call price book declares', async () => {
    for (const tier of Object.keys(MONTHLY_LIMITS)) {
      const decision = await service.check('tenant-declared', tier);
      expect(decision.limit, `call limit for ${tier}`).toBe(MONTHLY_LIMITS[tier]);
      expect(decision.tier).toBe(tier);
    }
  });
});
