/**
 * Feature Gate Middleware
 * Enforces tier-based access control on Express routes.
 *
 * Usage:
 *   router.get('/premium', requireTier('PRO'), handler)
 *   router.get('/signals/crossmarket', requireFeature('signals.crossmarket'), handler)
 *
 * Prerequisite: raas-gate middleware must run earlier in the chain
 * and attach the validated license to `req.license`.
 */

import type { Request, Response, NextFunction } from 'express';
import type { License } from '../../shared/types/license';

// Augment Express Request to expose the license set by upstream auth middleware
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      license?: License;
    }
  }
}

/** Supported tier identifiers (mirrors LicenseTier enum values plus signal add-ons) */
type Tier = 'FREE' | 'STARTER' | 'PRO' | 'ENTERPRISE' | 'MASTER' | 'SIGNALS_BASIC' | 'SIGNALS_PRO' | 'SIGNALS_ENTERPRISE';

/**
 * Ordinal ranking for tiers — higher number = more privileged.
 * Kept local so this module has no runtime dep on the gate package.
 */
const TIER_HIERARCHY: Record<Tier, number> = {
  FREE: 0,
  STARTER: 0.5,
  PRO: 1,
  ENTERPRISE: 2,
  MASTER: 3,
  // Signal tiers — separate from platform tiers, below FREE range
  SIGNALS_BASIC: 0.01,
  SIGNALS_PRO: 0.02,
  SIGNALS_ENTERPRISE: 0.03,
};

/**
 * Feature flag registry mapping feature keys to the minimum tier required.
 * Unregistered features default to accessible (FREE-level).
 */
export const FEATURE_ACCESS: Record<string, Tier> = {
  'signals_basic': 'PRO',
  'signals.crossmarket': 'PRO',
  'signals.deltaneutral': 'PRO',
  'intelligence.semantic': 'PRO',
  'intelligence.swarm': 'ENTERPRISE',
  'analytics.advanced': 'PRO',
  'execution.multileg': 'ENTERPRISE',
  'vibe.controller': 'PRO',
};

/**
 * Check whether a tier has access to the given feature key.
 * Returns true if the feature is unregistered (open access).
 */
export function canAccessFeature(feature: string, tier: Tier): boolean {
  const required = FEATURE_ACCESS[feature];
  if (!required) return true;
  return TIER_HIERARCHY[tier] >= TIER_HIERARCHY[required];
}

/**
 * Middleware factory: block requests whose license tier is below `minTier`.
 *
 * Reads `req.license` (must be set by upstream raas-gate middleware).
 * Returns 401 when no license is present, 403 when tier is insufficient.
 */
export function requireTier(minTier: Tier) {
  const requiredLevel = TIER_HIERARCHY[minTier];

  return (req: Request, res: Response, next: NextFunction): void => {
    const license = req.license;

    if (!license) {
      res.status(401).json({ error: 'No license' });
      return;
    }

    // Normalise to Tier — LicenseTier enum values match Tier string union
    const currentTier = license.tier as unknown as Tier;
    const userTierLevel = TIER_HIERARCHY[currentTier] ?? 0;

    if (userTierLevel < requiredLevel) {
      res.status(403).json({
        error: 'Insufficient tier',
        required: minTier,
        current: currentTier,
        upgrade: 'Contact support to upgrade your plan',
      });
      return;
    }

    next();
  };
}

/**
 * Middleware factory: enforce access based on a named feature key.
 * Delegates to `requireTier` using the tier registered in `FEATURE_ACCESS`.
 * Unregistered features pass through without restriction.
 *
 * Usage: router.get('/signals/crossmarket', requireFeature('signals.crossmarket'), handler)
 */
export function requireFeature(feature: string) {
  const requiredTier: Tier = FEATURE_ACCESS[feature] ?? 'FREE';
  return requireTier(requiredTier);
}

/** Signal-tier names for runtime checks */
const SIGNAL_TIERS: readonly Tier[] = ['SIGNALS_BASIC', 'SIGNALS_PRO', 'SIGNALS_ENTERPRISE'];

/**
 * Middleware factory: block requests whose signal tier is below `minSignalTier`.
 *
 * Signal tiers are separate from platform tiers (FREE/PRO/ENTERPRISE/MASTER).
 * A user must have a signal tier license to access signal-gated routes.
 *
 * Returns 401 when no license is present, 403 when signal tier is insufficient.
 */
export function requireSignalTier(minSignalTier: 'SIGNALS_BASIC' | 'SIGNALS_PRO' | 'SIGNALS_ENTERPRISE') {
  const requiredLevel = TIER_HIERARCHY[minSignalTier];

  return (req: Request, res: Response, next: NextFunction): void => {
    const license = req.license;

    if (!license) {
      res.status(401).json({ error: 'No license' });
      return;
    }

    const currentTier = license.tier as unknown as Tier;
    const userTierLevel = TIER_HIERARCHY[currentTier] ?? 0;

    // Signal tiers live below the FREE tier in the hierarchy, so normal
    // platform tier checks won't accidentally satisfy a signal gate.
    if (userTierLevel < requiredLevel || !SIGNAL_TIERS.includes(currentTier)) {
      res.status(403).json({
        error: 'Insufficient signal tier',
        required: minSignalTier,
        current: currentTier,
        upgrade: 'Upgrade your signal plan to access this feature',
      });
      return;
    }

    next();
  };
}
