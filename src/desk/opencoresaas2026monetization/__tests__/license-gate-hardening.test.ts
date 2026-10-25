/**
 * License gate hardening — entitlement and signing-key failure modes.
 *
 * Both cases below are the difference between a gate that checks and a gate that only looks like
 * it checks: a tier the hierarchy does not list, and a signing key that was never configured.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { createHmac } from 'crypto';
import { LicenseGate } from '../license-gate';
import type { LicenseTokenPayload, TierLevel } from '../catalog';

const TEST_SECRET = 'unit-test-signing-key-not-a-real-secret';

function payload(tier: string): LicenseTokenPayload {
  const now = Date.now();
  return {
    tenantId: 'tenant-hardening',
    tier: tier as TierLevel,
    issuedAt: now,
    expiresAt: now + 3_600_000,
    maxStrategies: 10,
    maxRps: 10,
  };
}

function signWithUnknownTier(gate: LicenseGate, tier: string): string {
  // Sign the raw JSON directly: the signature must stay valid so the tier check, not the
  // signature check, is what rejects the token.
  const serialized = Buffer.from(JSON.stringify(payload(tier))).toString('base64url');
  const signature = createHmac('sha256', (gate as unknown as { secretKey: string }).secretKey)
    .update(serialized)
    .digest('base64url');
  return `${serialized}.${signature}`;
}

describe('LicenseGate entitlement enforcement', () => {
  const originalSecret = process.env.LICENSE_HMAC_SECRET;
  afterEach(() => {
    if (originalSecret === undefined) {
      delete process.env.LICENSE_HMAC_SECRET;
    } else {
      process.env.LICENSE_HMAC_SECRET = originalSecret;
    }
  });

  it('rejects a token whose tier is outside the entitlement hierarchy', () => {
    const gate = new LicenseGate(TEST_SECRET);
    const forged = signWithUnknownTier(gate, 'PLATINUM');

    const result = gate.verifyToken(forged, 'BASIC');

    expect(result.isValid).toBe(false);
    expect(result.statusCode).toBe(401);
  });

  it('does not let an absent tier field pass the entitlement comparison', () => {
    const gate = new LicenseGate(TEST_SECRET);
    const unsigned = { tenantId: 't', issuedAt: Date.now(), expiresAt: Date.now() + 60_000 };
    const serialized = Buffer.from(JSON.stringify(unsigned)).toString('base64url');
    const signature = createHmac('sha256', (gate as unknown as { secretKey: string }).secretKey)
      .update(serialized)
      .digest('base64url');

    const result = gate.verifyToken(`${serialized}.${signature}`, 'BASIC');

    expect(result.isValid).toBe(false);
    expect(result.statusCode).toBe(401);
  });

  it('still accepts a valid token for an entitled tier', () => {
    const gate = new LicenseGate(TEST_SECRET);
    const token = gate.signToken(payload('ENTERPRISE'));

    expect(gate.verifyToken(token, 'BASIC').statusCode).toBe(200);
    expect(gate.verifyToken(token, 'ENTERPRISE').statusCode).toBe(200);
    expect(gate.verifyToken(token, 'MASTER').statusCode).toBe(402);
  });
});

describe('LicenseGate signing key resolution', () => {
  const originalSecret = process.env.LICENSE_HMAC_SECRET;
  afterEach(() => {
    if (originalSecret === undefined) {
      delete process.env.LICENSE_HMAC_SECRET;
    } else {
      process.env.LICENSE_HMAC_SECRET = originalSecret;
    }
  });

  it('refuses to fall back to a compiled-in secret when the env var is unset', () => {
    delete process.env.LICENSE_HMAC_SECRET;

    expect(() => new LicenseGate()).toThrow(/LICENSE_HMAC_SECRET/);
  });

  it('uses the configured env secret instead of throwing', () => {
    process.env.LICENSE_HMAC_SECRET = TEST_SECRET;

    const gate = new LicenseGate();
    expect(gate.signToken(payload('BASIC'))).toContain('.');
  });
});
