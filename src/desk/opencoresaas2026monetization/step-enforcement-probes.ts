/**
 * Behavioral probes for the Open-Core monetization and access steps.
 *
 * Each probe exercises the enforcement the step promises rather than the presence of a file, so
 * a step counts as verified only while the behavior can be shown to hold. Every probe is written
 * to be able to return `verified: false` — a check that cannot fail is not evidence.
 *
 * @module desk/opencoresaas2026monetization/step-enforcement-probes
 */

import crypto from 'node:crypto';
import { ComplianceAuditLogger } from '../security/audit-logger';
import { SubscriberTenantIsolator } from '../subscriber-tenant-isolator';
import { TIER_ENTITLEMENTS, TierEnum } from '../../billing/tier-activation-types';
import { UnifiedIpnWebhookHandler } from '../../billing/ipn-webhook';
import type { StepProbeResult } from './step-probe-types';

/**
 * Step 17 — immutable compliance audit ledger.
 *
 * A SHA-256 chain only counts as immutable if tampering is detectable. Append records, mutate one
 * behind the logger's back, and require `verifyIntegrity` to reject it.
 */
export function probeAuditLedgerImmutability(): StepProbeResult {
  const logger = new ComplianceAuditLogger();
  logger.append('tenant-a', 'DEPLOY');
  logger.append('tenant-a', 'TRADE');
  logger.append('tenant-b', 'WITHDRAW');

  if (!logger.verifyIntegrity()) {
    return { verified: false, evidence: 'untampered chain rejected as invalid', kind: 'behavioral' };
  }

  const mutableChain = (logger as unknown as { chain: Array<{ action: string }> }).chain;
  mutableChain[1].action = 'TAMPERED';

  if (logger.verifyIntegrity()) {
    return { verified: false, evidence: 'tampered chain still verified as valid', kind: 'behavioral' };
  }

  return {
    verified: true,
    evidence: 'hash chain verifies when intact and fails when a record is altered',
    kind: 'behavioral',
  };
}

/**
 * Step 16 — multi-tenant RBAC isolation.
 *
 * Cross-tenant access must be refused and same-tenant access allowed. Both directions matter: a
 * guard that throws for everyone would pass a one-sided check.
 */
export function probeTenantIsolation(): StepProbeResult {
  const isolator = new SubscriberTenantIsolator();

  let crossTenantRejected = false;
  try {
    isolator.verifyAccess('subscriber-A', 'subscriber-B');
  } catch {
    crossTenantRejected = true;
  }
  if (!crossTenantRejected) {
    return { verified: false, evidence: 'cross-subscriber access was allowed', kind: 'behavioral' };
  }

  let sameTenantAllowed = true;
  try {
    isolator.verifyAccess('subscriber-A', 'subscriber-A');
  } catch {
    sameTenantAllowed = false;
  }
  if (!sameTenantAllowed) {
    return { verified: false, evidence: 'own-subscriber access was rejected', kind: 'behavioral' };
  }

  return {
    verified: true,
    evidence: 'same-subscriber access allowed, cross-subscriber access refused',
    kind: 'behavioral',
  };
}

/**
 * Step 13 — four-tier entitlements.
 *
 * The guard only earns the name if the tiers are genuinely distinct, so the probe requires four
 * distinct tiers with ascending quotas. A table where every tier shares one limit is a pricing
 * table, not an entitlements guard.
 */
export function probeFourTierEntitlements(): StepProbeResult {
  const parsed = TierEnum.safeParse('MASTER');
  if (!parsed.success || parsed.data !== 'MASTER') {
    return { verified: false, evidence: 'MASTER is not a recognized tier', kind: 'behavioral' };
  }

  const quotas = TierEnum.options.map((tier) => TIER_ENTITLEMENTS[tier].apiCallsPerMonth);
  if (new Set(quotas).size !== 4) {
    return { verified: false, evidence: 'tiers do not have four distinct quotas', kind: 'behavioral' };
  }

  const sorted = [...quotas].sort((a, b) => a - b);
  const ascends = quotas.every((q, i) => q === sorted[i] && (i === 0 || q > sorted[i - 1]));
  if (!ascends) {
    return { verified: false, evidence: 'tier quotas do not ascend with the tier', kind: 'behavioral' };
  }

  return {
    verified: true,
    evidence: 'four distinct tiers with ascending API quotas enforced through the tier schema',
    kind: 'behavioral',
  };
}

/**
 * Step 20 — payment webhook activation.
 *
 * A checksum that any string satisfies is not verification. The probe signs a payload with the
 * configured key and requires the handler to accept the correct signature, reject a wrong one,
 * and refuse rather than implicitly pass when no key is configured.
 */
export function probeIpnSignatureVerification(): StepProbeResult {
  const key = 'probe-checksum-key';
  const handler = new UnifiedIpnWebhookHandler({ payosChecksumKey: key });
  const data = { orderCode: 1, amount: 1000, description: 'probe', currency: 'VND' };

  // Reproduce PayOS's documented signing rule (sorted key=value pairs joined by &) so the probe
  // does not depend on a helper the handler may not expose.
  const signString = Object.keys(data)
    .sort()
    .map((k) => `${k}=${String(data[k as keyof typeof data] ?? '')}`)
    .join('&');
  const correctSignature = crypto.createHmac('sha256', key).update(signString).digest('hex');

  if (!handler.verifyPayOSSignature(data, correctSignature)) {
    return { verified: false, evidence: 'correct checksum rejected', kind: 'behavioral' };
  }
  if (handler.verifyPayOSSignature(data, 'not-the-right-signature')) {
    return { verified: false, evidence: 'wrong checksum accepted', kind: 'behavioral' };
  }

  const keyless = new UnifiedIpnWebhookHandler({});
  if (keyless.verifyPayOSSignature(data, 'anything')) {
    return { verified: false, evidence: 'missing checksum key accepted a signature', kind: 'behavioral' };
  }

  return {
    verified: true,
    evidence: 'PayOS HMAC accepted when correct, rejected when wrong, refused without a key',
    kind: 'behavioral',
  };
}
