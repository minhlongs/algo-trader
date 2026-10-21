/**
 * Revenue License Metrics
 *
 * Tier pricing table and license predicates used by the revenue analytics
 * engine. Pure functions over license shape — no analytics aggregation — so the
 * pricing policy and the revenue curves can change independently.
 */

import { License, LicenseTier, LicenseStatus } from '../../shared/types/license';

/** List price per month (USD) by license tier. */
export const TIER_MO_PRICE: Record<LicenseTier, number> = {
  [LicenseTier.FREE]: 0,
  [LicenseTier.STARTER]: 19,
  [LicenseTier.PRO]: 99,
  [LicenseTier.ENTERPRISE]: 299,
  [LicenseTier.MASTER]: 999,
};

/** Monthly recurring revenue a single license contributes at tier list price. */
export function licenseMrr(l: License): number {
  return TIER_MO_PRICE[l.tier] ?? 0;
}

/** True when the license is ACTIVE and not past its expiry date. */
export function isLicenseActive(l: License): boolean {
  return l.status === LicenseStatus.ACTIVE && (!l.expiresAt || new Date(l.expiresAt) > new Date());
}

/**
 * Average lifespan in days across inactive licenses, measured from creation to
 * the license's last mutation (or its expiry). Returns 0 when nothing has
 * churned yet, so callers can substitute a default.
 */
export function averageLifespanDays(licenses: License[]): number {
  const inactive = licenses.filter((l) => l.status !== LicenseStatus.ACTIVE);
  if (!inactive.length) return 0;
  return (
    inactive.reduce((acc, l) => {
      const end = l.updatedAt || l.expiresAt || new Date().toISOString();
      return acc + (new Date(end).getTime() - new Date(l.createdAt).getTime()) / 86400000;
    }, 0) / inactive.length
  );
}
