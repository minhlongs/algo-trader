// SPDX-License-Identifier: MIT
/**
 * Behavioral probes for the two gates the readiness verdict depends on.
 *
 * These are the enforcement points that decide whether a cloud request is allowed, so their
 * probes are strictest: an HMAC gate that accepts a tampered signature, or a quota meter that
 * never returns 402, is a monetization surface that only looks enforced. Every probe checks both
 * directions — the valid case succeeds and the invalid case is refused.
 *
 * @module desk/opencoresaas2026monetization/step-gate-probes
 */

import { LicenseGate } from './license-gate';
import { BillingMeter, TIER_QUOTAS } from './billing-meter';
import type { StepProbeResult } from './step-probe-types';

const PROBE_SECRET = 'probe-signing-key-not-a-real-secret';

function payload(overrides: Partial<{
  tenantId: string; tier: 'BASIC' | 'PREMIUM' | 'ENTERPRISE' | 'MASTER';
  expiresAt: number; maxStrategies: number; maxRps: number;
}> = {}) {
  const now = Date.now();
  return {
    tenantId: 'probe-tenant',
    tier: 'BASIC' as const,
    issuedAt: now,
    expiresAt: now + 3_600_000,
    maxStrategies: 5,
    maxRps: 5,
    ...overrides,
  };
}

/**
 * Step 11 — HMAC-SHA256 license gate.
 *
 * "Mounted" means the route calls it. "Enforced" means a tampered signature is rejected and an
 * under-tier token gets 402. Both directions are required; a gate that accepts everything passes
 * an existence check but fails here.
 */
export function probeLicenseGateEnforcement(): StepProbeResult {
  const gate = new LicenseGate(PROBE_SECRET);
  const token = gate.signToken(payload());

  const valid = gate.verifyToken(token, 'BASIC');
  const tampered = gate.verifyToken(`${token.slice(0, -4)}AAAA`, 'BASIC');
  const underTier = gate.verifyToken(gate.signToken(payload({ tier: 'BASIC' })), 'MASTER');
  const expired = gate.verifyToken(gate.signToken(payload({ expiresAt: Date.now() - 1000 })), 'BASIC');

  if (!valid.isValid || valid.statusCode !== 200) {
    return { verified: false, evidence: 'valid token rejected', kind: 'behavioral' };
  }
  if (tampered.isValid || tampered.statusCode !== 401) {
    return { verified: false, evidence: 'tampered signature accepted', kind: 'behavioral' };
  }
  if (underTier.isValid || underTier.statusCode !== 402) {
    return { verified: false, evidence: 'under-tier token granted', kind: 'behavioral' };
  }
  if (expired.isValid || expired.statusCode !== 402) {
    return { verified: false, evidence: 'expired token accepted', kind: 'behavioral' };
  }

  return {
    verified: true,
    evidence: 'HMAC sign/verify, tamper rejection (401), tier and expiry enforcement (402) all hold',
    kind: 'behavioral',
  };
}

/**
 * Step 12 — MCU/quota metering.
 *
 * A meter that never emits 402 is a file, not a control. The probe consumes quota past the tier
 * ceiling and requires the next call to be denied.
 */
export function probeQuotaMetering(): StepProbeResult {
  const meter = new BillingMeter();
  const tenant = 'probe-quota-tenant';

  const before = meter.checkQuota(tenant, 'BASIC', 1);
  if (before.isAllowed !== true || before.statusCode !== 200) {
    return { verified: false, evidence: 'tenant under quota is denied', kind: 'behavioral' };
  }

  meter.recordConsumption(tenant, TIER_QUOTAS.BASIC.monthlyMcuLimit);
  const exhausted = meter.checkQuota(tenant, 'BASIC', 1);

  if (exhausted.isAllowed !== false || exhausted.statusCode !== 402) {
    return { verified: false, evidence: 'exhausted quota not denied with 402', kind: 'behavioral' };
  }

  return {
    verified: true,
    evidence: 'quota allowed under limit (200) and denied with 402 once the monthly MCU limit is consumed',
    kind: 'behavioral',
  };
}
