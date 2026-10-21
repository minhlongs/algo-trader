/**
 * License Record Factory
 *
 * Construction of fully-formed License records from CLI/API inputs. Separated
 * from LicenseService so the "what makes a valid license row" rules — id shape,
 * timestamps, default usage cap — live in one reviewable place.
 */

import {
  License,
  LicenseStatus,
  LicenseTier,
  type CreateLicenseInput,
} from '../../shared/types/license';
import { createLicenseKey, getDefaultMaxUsage } from './license-types';

/** Id shape for a newly created license (two random base36 segments). */
export function generateLicenseId(): string {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

/** Current timestamp in the ISO-8601 form licenses store. */
function nowIso(): string {
  return new Date().toISOString();
}

/** A license created from the simple `{userId, tier, validUntil}` CLI input. */
export function buildLicenseFromTierInput(input: {
  userId?: string;
  tier: string;
  validUntil?: Date;
}): License {
  const tierEnum = resolveTier(input.tier);
  const now = nowIso();
  return {
    id: `lic_${generateLicenseId()}`,
    key: createLicenseKey(tierEnum),
    name: input.tier.toUpperCase(),
    tier: tierEnum,
    status: LicenseStatus.ACTIVE,
    userId: input.userId || 'anon',
    createdAt: now,
    updatedAt: now,
    usageCount: 0,
    maxUsage: getDefaultMaxUsage(tierEnum),
    expiresAt: input.validUntil?.toISOString(),
  };
}

/** A license created from the full CreateLicenseInput API input. */
export function buildLicenseFromInput(input: CreateLicenseInput): License {
  const now = nowIso();
  return {
    id: `lic_${generateLicenseId()}`,
    name: input.name,
    key: createLicenseKey(input.tier),
    tier: input.tier,
    status: LicenseStatus.ACTIVE,
    createdAt: now,
    updatedAt: now,
    usageCount: 0,
    maxUsage: getDefaultMaxUsage(input.tier),
    tenantId: input.tenantId,
    domain: input.domain,
    expiresAt: input.expiresAt,
  };
}

/** Map a free-form tier string to the enum, defaulting to FREE when unknown. */
function resolveTier(tier: string): LicenseTier {
  return LicenseTier[tier.toUpperCase() as keyof typeof LicenseTier] || LicenseTier.FREE;
}
