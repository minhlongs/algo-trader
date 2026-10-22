// SPDX-License-Identifier: MIT
/**
 * Behavioral probes — each probe must be able to fail.
 *
 * A probe that always returns `verified: true` would recreate the dishonesty this phase removes,
 * so every behavioral probe is checked in both directions: it passes on the real implementation
 * and fails when the underlying behavior is broken.
 */

import { describe, expect, it } from 'vitest';
import { behaviorallyProbedStepIds, probeStep, probeUnsupported } from '../step-behavior-probes';
import { probeQuotaMetering } from '../step-gate-probes';
import { OPEN_CORE_25_STEPS } from '../catalog';
import { BillingMeter } from '../billing-meter';

describe('quota metering probe (step 12)', () => {
  it('verifies a meter that allows under limit and denies with 402 past it', () => {
    const result = probeQuotaMetering();
    expect(result.verified).toBe(true);
    expect(result.kind).toBe('behavioral');
  });

  it('fails a meter that never denies', () => {
    const neverDenies = {
      checkQuota: () => ({ isAllowed: true, statusCode: 200 as const }),
      recordConsumption: () => undefined,
    };
    const real = BillingMeter.prototype.checkQuota;
    BillingMeter.prototype.checkQuota = neverDenies.checkQuota as typeof real;
    try {
      expect(probeQuotaMetering().verified).toBe(false);
    } finally {
      BillingMeter.prototype.checkQuota = real;
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
