/**
 * Enforcement probes — each must be able to fail.
 *
 * A probe that only ever returns green is the same dishonesty this phase removes, so each of these
 * is checked in the direction that matters: the probe passes on the real implementation and fails
 * when the enforcement is removed.
 */

import { describe, expect, it } from 'vitest';
import {
  probeAuditLedgerImmutability,
  probeFourTierEntitlements,
  probeIpnSignatureVerification,
  probeTenantIsolation,
} from '../step-enforcement-probes';
import { ComplianceAuditLogger } from '../../security/audit-logger';
import { TIER_ENTITLEMENTS } from '../../../billing/tier-activation-types';
import { SubscriberTenantIsolator } from '../../subscriber-tenant-isolator';
import { UnifiedIpnWebhookHandler } from '../../../billing/ipn-webhook';

describe('audit ledger probe (step 17)', () => {
  it('verifies a chain that detects tampering', () => {
    const result = probeAuditLedgerImmutability();
    expect(result.verified).toBe(true);
    expect(result.kind).toBe('behavioral');
  });

  it('fails a logger whose integrity check never fails', () => {
    const real = ComplianceAuditLogger.prototype.verifyIntegrity;
    ComplianceAuditLogger.prototype.verifyIntegrity = () => true;
    try {
      expect(probeAuditLedgerImmutability().verified).toBe(false);
    } finally {
      ComplianceAuditLogger.prototype.verifyIntegrity = real;
    }
  });
});

describe('tenant isolation probe (step 16)', () => {
  it('verifies isolation that allows own tenant and refuses a foreign one', () => {
    expect(probeTenantIsolation().verified).toBe(true);
  });

  it('fails a guard that permits every cross-tenant access', () => {
    const real = SubscriberTenantIsolator.prototype.verifyAccess;
    SubscriberTenantIsolator.prototype.verifyAccess = () => undefined;
    try {
      expect(probeTenantIsolation().verified).toBe(false);
    } finally {
      SubscriberTenantIsolator.prototype.verifyAccess = real;
    }
  });

  it('fails a guard that rejects even the owning tenant', () => {
    const real = SubscriberTenantIsolator.prototype.verifyAccess;
    SubscriberTenantIsolator.prototype.verifyAccess = () => {
      throw new Error('denied');
    };
    try {
      expect(probeTenantIsolation().verified).toBe(false);
    } finally {
      SubscriberTenantIsolator.prototype.verifyAccess = real;
    }
  });
});

describe('four-tier entitlements probe (step 13)', () => {
  it('verifies four distinct ascending tiers', () => {
    expect(probeFourTierEntitlements().verified).toBe(true);
  });

  it('fails when every tier collapses onto one quota', () => {
    const real = TIER_ENTITLEMENTS.BASIC.apiCallsPerMonth;
    TIER_ENTITLEMENTS.PREMIUM.apiCallsPerMonth = real;
    TIER_ENTITLEMENTS.ENTERPRISE.apiCallsPerMonth = real;
    TIER_ENTITLEMENTS.MASTER.apiCallsPerMonth = real;
    try {
      expect(probeFourTierEntitlements().verified).toBe(false);
    } finally {
      TIER_ENTITLEMENTS.PREMIUM.apiCallsPerMonth = 50_000;
      TIER_ENTITLEMENTS.ENTERPRISE.apiCallsPerMonth = 500_000;
      TIER_ENTITLEMENTS.MASTER.apiCallsPerMonth = 999_999;
    }
  });
});

describe('IPN signature probe (step 20)', () => {
  it('verifies a checksum that accepts the correct signature only', () => {
    expect(probeIpnSignatureVerification().verified).toBe(true);
  });

  it('fails a verifier that accepts any signature', () => {
    const real = UnifiedIpnWebhookHandler.prototype.verifyPayOSSignature;
    UnifiedIpnWebhookHandler.prototype.verifyPayOSSignature = () => true;
    try {
      expect(probeIpnSignatureVerification().verified).toBe(false);
    } finally {
      UnifiedIpnWebhookHandler.prototype.verifyPayOSSignature = real;
    }
  });

  it('fails a verifier that rejects the correct signature', () => {
    const real = UnifiedIpnWebhookHandler.prototype.verifyPayOSSignature;
    UnifiedIpnWebhookHandler.prototype.verifyPayOSSignature = () => false;
    try {
      expect(probeIpnSignatureVerification().verified).toBe(false);
    } finally {
      UnifiedIpnWebhookHandler.prototype.verifyPayOSSignature = real;
    }
  });
});
