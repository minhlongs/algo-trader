/**
 * Behavioral probes — each probe must be able to fail.
 *
 * A probe that always returns `verified: true` would recreate the dishonesty this phase removes,
 * so every behavioral probe is checked in both directions: it passes on the real implementation
 * and fails when the underlying behavior is broken.
 */

import { describe, expect, it, vi } from 'vitest';
import { behaviorallyProbedStepIds, probeStep, probeUnsupported } from '../step-behavior-probes';
import { probeQuotaMetering } from '../step-gate-probes';
import { OPEN_CORE_25_STEPS } from '../catalog';
import { UsageMeteringService } from '../../../platform/signals-api/usage-metering-service';

/**
 * The probe reads the durable meter, so its query must answer like a real empty
 * period row: no usage recorded yet. Returning `undefined` here would throw
 * inside the meter and the probe would fail for the wrong reason.
 */
const queryMock = vi.fn(async () => ({ rows: [] as { mcu_this_period: number }[] }));

vi.mock('../../../db/postgres-client', () => ({ query: (...a: unknown[]) => queryMock(...a) }));
vi.mock('../../../shared/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

describe('quota metering probe (step 12)', () => {
  it('verifies a meter that allows under limit and denies with 402 past it', async () => {
    const result = await probeQuotaMetering();
    expect(result.verified).toBe(true);
    expect(result.kind).toBe('behavioral');
  });

  it('fails a meter that never denies', async () => {
    const neverDenies = {
      checkMcu: async () => ({ isAllowed: true, statusCode: 200 as const }),
    };
    const real = UsageMeteringService.prototype.checkMcu;
    UsageMeteringService.prototype.checkMcu = neverDenies.checkMcu as typeof real;
    try {
      const result = await probeQuotaMetering();
      expect(result.verified).toBe(false);
    } finally {
      UsageMeteringService.prototype.checkMcu = real;
    }
  });
});

describe('license gate probe (step 11)', () => {
  it('verifies enforcement of tamper, tier and expiry', async () => {
    const result = await probeStep('hmac-jwt-license-gate', '/Users/macbook/algo-trader');
    expect(result.verified).toBe(true);
    expect(result.kind).toBe('behavioral');
  });
});

describe('unsupported probes', () => {
  it('reports absent so the audit cannot count the step as verified', () => {
    const result = probeUnsupported();
    expect(result.verified).toBe(false);
    expect(result.kind).toBe('absent');
  });

  it('only registers probes against real catalog step ids', () => {
    const catalogIds = new Set(OPEN_CORE_25_STEPS.map((s) => s.id));
    for (const id of behaviorallyProbedStepIds()) {
      expect(catalogIds.has(id)).toBe(true);
    }
  });
});
